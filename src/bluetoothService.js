class BluetoothService {
    constructor() {
        this.deviceId = null;
        this.incomingMessage = null;
        this.error = null;
        this.regex = /([0-9A-Z]{2}\s[0-9A-Z]{2}\s[0-9A-Z]{2})/g;
        this.debug = () => {};
        this.subscriptionActive = false;
    }

    async requestBluetoothPermissions() {
        return new Promise(async (resolve, reject) => {
            // Check if running in browser or without Cordova
            if (!window.cordova) {
                resolve(true); // Browser environment doesn't need permissions
                return;
            }

            // Check if device object is available
            if (typeof device === 'undefined' || !device.platform || !device.version) {
                console.warn('Device info not available, assuming non-Android platform');
                resolve(true);
                return;
            }

            const androidVersion = parseFloat(device.version);

            // For Android 12+ (including Android 14), we need specific permissions
            if (androidVersion >= 12) {
                // Check if permissions plugin is available
                if (!window.cordova.plugins || !window.cordova.plugins.permissions) {
                    console.error('Permissions plugin not available');
                    reject(new Error('Permissions plugin not available'));
                    return;
                }

                const permissions = window.cordova.plugins.permissions;

                // Android 14 requires these specific permissions for Bluetooth
                let bluetoothPermissions = [
                    permissions.BLUETOOTH_CONNECT,
                    permissions.BLUETOOTH_SCAN
                ];

                // For Android 14, we might also need location permissions for Bluetooth discovery
                if (androidVersion >= 14) {
                    bluetoothPermissions.push(permissions.ACCESS_FINE_LOCATION);
                }

                // Request permissions
                permissions.requestPermissions(
                    bluetoothPermissions,
                    (status) => {
                        const allGranted = bluetoothPermissions.every(permission => {
                            // Handle different permission formats
                            if (typeof permission === 'string') {
                                // If permission is a string, check direct
                                return status.hasPermission || status[permission] || status.hasPermission === true;
                            } else {
                                // If permission is a constant from the plugin
                                return status.hasPermission[permission] || status.hasPermission === true;
                            }
                        });

                        if (allGranted) {
                            console.log('All Bluetooth permissions granted');
                            resolve(true);
                        } else {
                            console.error('Not all Bluetooth permissions granted', status);
                            reject(new Error('Not all Bluetooth permissions granted'));
                        }
                    },
                    (err) => {
                        console.error('Error requesting permissions:', err);
                        reject(new Error('Error requesting Bluetooth permissions: ' + err.message));
                    }
                );
            } else {
                // For older Android versions, Bluetooth permissions are granted automatically
                console.log('Older Android version, permissions handled automatically');
                resolve(true);
            }
        });
    }


    async getDevices() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return [];
        }

        try {
            // Request permissions before attempting to get devices
            console.log(cordova?.platformId)
            if (cordova?.platformId === 'android') {
                await this.requestBluetoothPermissions();
            }
            return await this.promisify(bluetoothSerial.list.bind(bluetoothSerial));
        } catch (error) {
            console.error('Error getting devices:', error);
            // Re-throw the error to be handled by the calling function
            throw error;
        }
    }

    async connectToDevice(uuid) {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return false;
        }

        this.debug('connecting to ' + uuid);
        let result = false;
        try{
            // Request permissions before attempting to connect
            if (cordova?.platformId === 'android') {
                await this.requestBluetoothPermissions();
            }

            // Ensure we're disconnected from any previous connections
            if (this.deviceId) {
                await this.disconnect();
            }

            await this.promisify(bluetoothSerial.connect.bind(bluetoothSerial, uuid));
            this.deviceId = uuid;
            result = true;
            console.log('connected');
        } catch(e) {
            console.log('error connect', e);
            // Check if the error is related to permissions and re-throw for UI handling
            if (e.message && (e.message.includes('Permission') || e.message.includes('permission'))) {
                throw e;
            }
            result = false;
        }
        return result;
    }

    async disconnect() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            this.deviceId = null;
            this.incomingMessage = null;
            this.error = null;
            return;
        }

        if (this.subscriptionActive) {
            await this.promisify(bluetoothSerial.unsubscribe.bind(bluetoothSerial));
            this.subscriptionActive = false;
        }
        await this.promisify(bluetoothSerial.disconnect.bind(bluetoothSerial));
        this.deviceId = null;
        this.incomingMessage = null; // Reset incoming message buffer
        this.error = null; // Reset error state
    }

    async initElm() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return false;
        }

        if(!this.deviceId) {
            this.debug('no device id');
            return false;
        }

        // Clear any previous message before starting initialization
        this.incomingMessage = null;

        let answer;
        this.listen();
        await this.sendData('ATZ');
        answer = await this.getAnswer();
        await this.sendData('ATSP0');
        answer = await this.getAnswer();
        await this.sendData('0100');
        answer = await this.getAnswer();
        while(!answer.match(this.regex)) {
            answer = await this.getAnswer();
        }
    }

    async getTemperature() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return null;
        }

        try {
            await this.sendData('0105');
            let temp = await this.getAnswer();
            if(temp){
                temp = temp.replace('>', '').trim().split(' ');
                temp = temp[temp.length - 1];
                return temp;
            }
            return null;
        } catch (error) {
            console.error('Error getting temperature:', error);
            return null;
        }
    }

    async sendData(data) {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return Promise.reject(new Error('Bluetooth serial not available'));
        }

        this.debug('>' + data + '\r\n');
        return await this.promisify(bluetoothSerial.write.bind(bluetoothSerial, data + '\r\n'));
    }

    listen() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return;
        }

        // Unsubscribe first if already subscribed to prevent multiple subscriptions
        if (this.subscriptionActive) {
            this.promisify(bluetoothSerial.unsubscribe.bind(bluetoothSerial)).then(() => {
                this.subscriptionActive = false;
            }).catch(() => {
                // Even if unsubscribe fails, continue with fresh subscription
                this.subscriptionActive = false;
            });
        }

        bluetoothSerial.subscribe('>', (data) => {
            this.debug('listen ' + data);
            console.log(data);
            this.incomingMessage = data;
        }, (error) => {
            console.log('subscription error', error);
            this.error = error;
            this.subscriptionActive = false;
        });

        this.subscriptionActive = true;
    }

    async getAnswer() {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            console.warn('Bluetooth serial not available in browser environment');
            return Promise.reject(new Error('Bluetooth serial not available'));
        }

        return new Promise((res, rej) => {
            let startTime = Date.now();
            const timeout = 5000; // 5 second timeout

            let intId = setInterval(() => {
                if(this.incomingMessage) {
                    res(this.incomingMessage);
                    this.debug('<<' + this.incomingMessage);
                    this.incomingMessage = null;
                    clearInterval(intId);
                } else if(this.error) {
                    rej(this.error);
                    this.debug('<<' + this.error);
                    this.error = null;
                    clearInterval(intId);
                } else if (Date.now() - startTime > timeout) {
                    // Timeout reached, reject the promise
                    rej(new Error('Timeout waiting for response'));
                    clearInterval(intId);
                }
            }, 200)
        }, )
    }

    setDebug(callback) {
        this.debug = callback;
    }

    promisify(action) {
        // Check if bluetoothSerial is available (not in browser)
        if (!window.bluetoothSerial) {
            return Promise.reject(new Error('Bluetooth serial not available in browser environment'));
        }

        return new Promise((resolve, reject) => {
            action((data) => {
                resolve(data)
            }, (err) => {
                reject(err)
            })
        })
    }
}

let service = new BluetoothService();

export default service;