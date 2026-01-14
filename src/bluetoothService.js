class BluetoothService {
  constructor() {
    this.deviceId = null;
    this.incomingMessage = null;
    this.error = null;
    this.regex = /([0-9A-Z]{2}\s[0-9A-Z]{2}\s[0-9A-Z]{2})/g;
    this.debug = () => {};
    this.subscriptionActive = false;
  }

  // Helper method to check if bluetoothSerial is available
  isBluetoothAvailable() {
    return !!window.bluetoothSerial;
  }

  // Helper method to check if running in Cordova environment
  isCordovaEnvironment() {
    return !!window.cordova;
  }

  async requestBluetoothPermissions() {
    // Check if running in browser or without Cordova
    if (!this.isCordovaEnvironment()) {
      return true; // Browser environment doesn't need permissions
    }

    // Check if device object is available
    if (
      typeof device === "undefined" ||
      !device?.platform ||
      !device?.version
    ) {
      console.warn(
        "Device info not available, assuming non-Android platform"
      );
      return true;
    }

    const androidVersion = parseFloat(device.version);

    // For Android versions below 12, permissions are granted automatically
    if (androidVersion < 12) {
      console.log("Older Android version, permissions handled automatically");
      return true;
    }

    // Check if permissions plugin is available
    const permissions = window.cordova?.plugins?.permissions;
    if (!permissions) {
      throw new Error("Permissions plugin not available");
    }

    // Android 12+ requires specific permissions for Bluetooth
    const bluetoothPermissions = [
      permissions.BLUETOOTH_CONNECT,
      permissions.BLUETOOTH_SCAN,
    ];

    // Android 14+ also needs location permissions for Bluetooth discovery
    if (androidVersion >= 14) {
      bluetoothPermissions.push(permissions.ACCESS_FINE_LOCATION);
    }

    // Request permissions using promisified approach
    return new Promise((resolve, reject) => {
      permissions.requestPermissions(
        bluetoothPermissions,
        (status) => {
          const allGranted = bluetoothPermissions.every((permission) => {
            // Handle different permission formats
            if (typeof permission === "string") {
              return (
                status.hasPermission ||
                status[permission] ||
                status.hasPermission === true
              );
            }
            return (
              status.hasPermission?.[permission] ||
              status.hasPermission === true
            );
          });

          if (allGranted) {
            console.log("All Bluetooth permissions granted");
            resolve(true);
          } else {
            console.error("Not all Bluetooth permissions granted", status);
            reject(new Error("Not all Bluetooth permissions granted"));
          }
        },
        (err) => {
          console.error("Error requesting permissions:", err);
          reject(
            new Error(
              `Error requesting Bluetooth permissions: ${err?.message || err}`
            )
          );
        }
      );
    });
  }

  async getDevices() {
    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      return [];
    }

    try {
      // Request permissions before attempting to get devices
      if (window.cordova?.platformId === "android") {
        await this.requestBluetoothPermissions();
      }
      return await this.promisify(() =>
        window.bluetoothSerial.list.bind(window.bluetoothSerial)
      );
    } catch (error) {
      console.error("Error getting devices:", error);
      throw error;
    }
  }

  async connectToDevice(uuid) {
    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      return false;
    }

    this.debug(`Connecting to ${uuid}`);

    try {
      // Request permissions before attempting to connect
      if (window.cordova?.platformId === "android") {
        await this.requestBluetoothPermissions();
      }

      // Ensure we're disconnected from any previous connections
      if (this.deviceId) {
        await this.disconnect();
      }

      await this.promisify(() =>
        window.bluetoothSerial.connect.bind(window.bluetoothSerial, uuid)
      );

      this.deviceId = uuid;
      console.log(`Connected to device ${uuid}`);
      return true;
    } catch (error) {
      console.error("Error connecting to device:", error);

      // Re-throw permission-related errors for UI handling
      if (error?.message?.toLowerCase().includes("permission")) {
        throw error;
      }

      return false;
    }
  }

  async disconnect() {
    // Reset state even if bluetooth is not available
    const resetState = () => {
      this.deviceId = null;
      this.incomingMessage = null;
      this.error = null;
      this.subscriptionActive = false;
    };

    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      resetState();
      return;
    }

    try {
      if (this.subscriptionActive) {
        await this.promisify(() =>
          window.bluetoothSerial.unsubscribe.bind(window.bluetoothSerial)
        );
      }

      await this.promisify(() =>
        window.bluetoothSerial.disconnect.bind(window.bluetoothSerial)
      );

      console.log("Disconnected successfully");
    } catch (error) {
      console.error("Error during disconnect:", error);
    } finally {
      resetState();
    }
  }

  async initElm() {
    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      return false;
    }

    if (!this.deviceId) {
      this.debug("No device ID set");
      return false;
    }

    try {
      // Clear any previous message before starting initialization
      this.incomingMessage = null;

      this.listen();

      // Reset ELM327
      await this.sendData("ATZ");
      await this.getAnswer();

      // Set protocol to auto
      await this.sendData("ATSP0");
      await this.getAnswer();

      // Get supported PIDs
      await this.sendData("0100");
      let answer = await this.getAnswer();

      // Wait for valid response matching expected format
      let attempts = 0;
      const maxAttempts = 5;

      while (!answer.match(this.regex) && attempts < maxAttempts) {
        answer = await this.getAnswer();
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error("Failed to initialize ELM327: No valid response");
      }

      console.log("ELM327 initialized successfully");
      return true;
    } catch (error) {
      console.error("Error initializing ELM327:", error);
      return false;
    }
  }

  async getTemperature() {
    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      return null;
    }

    try {
      // PID 0105 is for engine coolant temperature
      await this.sendData("0105");
      const response = await this.getAnswer();

      if (!response) {
        return null;
      }

      // Parse temperature from response
      // Response format: "41 05 XX" where XX is temp value
      const parts = response.replace(">", "").trim().split(" ");
      const tempHex = parts[parts.length - 1];

      return tempHex;
    } catch (error) {
      console.error("Error getting temperature:", error);
      return null;
    }
  }

  async sendData(data) {
    if (!this.isBluetoothAvailable()) {
      throw new Error("Bluetooth serial not available");
    }

    this.debug(`> ${data}`);
    return await this.promisify(() =>
      window.bluetoothSerial.write.bind(window.bluetoothSerial, `${data}\r\n`)
    );
  }

  async listen() {
    if (!this.isBluetoothAvailable()) {
      console.warn("Bluetooth serial not available in browser environment");
      return;
    }

    // Unsubscribe first if already subscribed to prevent multiple subscriptions
    if (this.subscriptionActive) {
      try {
        await this.promisify(() =>
          window.bluetoothSerial.unsubscribe.bind(window.bluetoothSerial)
        );
      } catch (error) {
        console.warn("Failed to unsubscribe:", error);
      } finally {
        this.subscriptionActive = false;
      }
    }

    // Clear any pending messages/errors
    this.incomingMessage = null;
    this.error = null;

    window.bluetoothSerial.subscribe(
      ">",
      (data) => {
        this.debug(`< ${data}`);
        console.log("Received data:", data);
        this.incomingMessage = data;
      },
      (error) => {
        console.error("Subscription error:", error);
        this.error = error;
        this.subscriptionActive = false;
      }
    );

    this.subscriptionActive = true;
  }

  async getAnswer(timeoutMs = 5000) {
    if (!this.isBluetoothAvailable()) {
      throw new Error("Bluetooth serial not available");
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const pollInterval = 100; // Poll every 100ms instead of 200ms for better responsiveness

      const intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (this.incomingMessage) {
          const message = this.incomingMessage;
          this.debug(`<< ${message}`);
          this.incomingMessage = null;
          clearInterval(intervalId);
          resolve(message);
        } else if (this.error) {
          const error = this.error;
          this.debug(`<< Error: ${error}`);
          this.error = null;
          clearInterval(intervalId);
          reject(error);
        } else if (elapsed > timeoutMs) {
          clearInterval(intervalId);
          reject(new Error(`Timeout waiting for response (${timeoutMs}ms)`));
        }
      }, pollInterval);
    });
  }

  setDebug(callback) {
    if (typeof callback === "function") {
      this.debug = callback;
    } else {
      console.warn("setDebug expects a function");
    }
  }

  promisify(actionFactory) {
    if (!this.isBluetoothAvailable()) {
      return Promise.reject(
        new Error("Bluetooth serial not available in browser environment")
      );
    }

    return new Promise((resolve, reject) => {
      const action = actionFactory();
      action(
        (data) => resolve(data),
        (error) => reject(error)
      );
    });
  }
}

let service = new BluetoothService();

export default service;
