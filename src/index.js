import { createApp } from 'vue';
import bluetoothService from './bluetoothService';

import './styles.css'

var cordovaApp = {
    // Application Constructor
    initialize: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
    },

    // deviceready Event Handler
    //
    // Bind any cordova events here. Common events are:
    // 'pause', 'resume', etc.
    onDeviceReady: async function() {
        // Initialize permissions plugin if available
        if (cordova.plugins && cordova.plugins.permissions) {
            console.log('Permissions plugin available');

            // Check if device object is available (not available in browser)
            if (typeof device !== 'undefined' && device.platform && device.version) {
                // Request Bluetooth permissions on startup for Android 12+
                if (device.platform.toLowerCase() === 'android' && parseInt(device.version) >= 12) {
                    try {
                        console.log('Requesting Bluetooth permissions for Android ' + device.version);
                        await bluetoothService.requestBluetoothPermissions();
                        console.log('Bluetooth permissions handled successfully');
                    } catch (error) {
                        console.error('Error requesting Bluetooth permissions:', error);
                        // Show a user-friendly message about permissions
                        // Using setTimeout to ensure DOM is ready
                        setTimeout(() => {
                            alert('Для работы приложения необходимо разрешение на использование Bluetooth. Пожалуйста, предоставьте его в настройках приложения.');
                        }, 1000);
                    }
                } else {
                    console.log('Android version < 12, using legacy permissions');
                }
            } else {
                console.log('Device info not available (running in browser)');
            }
        } else {
            console.log('Permissions plugin not available');
            // Still create the Vue app even if permissions plugin is not available
        }

        createVueApp();
    },
  };

  cordovaApp.initialize();

let intevalId = null;
function getColor(value){
    var hue=((1-value)*200).toString(10);
    return ["hsl(",hue,",100%,50%)"].join("");
}

function createVueApp() {
    const app = createApp({
        data() {
            return {
                devices: [],
                showList: true,
                showContent: false,
                showPermissionMessage: false, // Добавляем переменную для отображения сообщения о разрешениях
                temp: null,
                debug: '',
                customCommand: '',
                deviceId: null,
                isLoading: false, // Add loading state
                showDebug: true // Toggle for debug panel visibility
             }
        },
        methods: {
            async getDeviceList() {
                try{
                    this.devices = [];
                    // Show loading indicator
                    this.isLoading = true;
                    // Show permission message before attempting to get devices
                    this.showPermissionMessage = true;

                    // On Android 12+, we need to ensure permissions are granted before scanning
                    if (cordova?.platformId === 'android' && typeof device !== 'undefined' && device.version) {
                        const androidVersion = parseFloat(device.version);
                        if (androidVersion >= 12) {
                            await bluetoothService.requestBluetoothPermissions();
                        }
                    }

                    let devices = await bluetoothService.getDevices();
                    this.devices = devices;
                    // Hide permission message after successful retrieval
                    this.showPermissionMessage = false;
                } catch(e) {
                    console.log(e);
                    // Show user-friendly error message for permission issues
                    if (e.message && (e.message.includes('Permission') || e.message.includes('permission'))) {
                        this.updateLog('Bluetooth permission denied. Please enable Bluetooth permissions in app settings.');
                        // Show the permission message again if permission was denied
                        this.showPermissionMessage = true;
                        // Prompt user to go to settings
                        setTimeout(() => {
                            if (cordova.plugins.diagnostic) {
                                cordova.plugins.diagnostic.switchToSettings(() => {
                                    console.log("Switched to settings");
                                }, (error) => {
                                    console.log("Error opening settings: " + error);
                                });
                            }
                        }, 2000);
                    } else {
                        this.updateLog('Error getting devices: ' + e.message);
                        // Hide the permission message for non-permission errors
                        this.showPermissionMessage = false;
                    }
                } finally {
                    // Hide loading indicator
                    this.isLoading = false;
                }
            },
            async selectDevice(device) {
                try{
                    this.updateLog(device)
                    // Stop any existing monitoring before reconnecting
                    this.stopMonitoring();

                    // Ensure permissions are granted before connecting
                    if (cordova?.platformId === 'android' && typeof device !== 'undefined' && device.version) {
                        const androidVersion = parseFloat(device.version);
                        if (androidVersion >= 12) {
                            await bluetoothService.requestBluetoothPermissions();
                        }
                    }

                    let connected = await bluetoothService.connectToDevice(device.id);
                    if(connected) {
                        this.updateLog('connected')
                        this.deviceId = device.id;
                        this.showList = false;
                        this.showContent = true;
                        await bluetoothService.initElm();
                        this.updateLog('elm inited');
                        this.startMonitoring();
                    } else {
                        this.updateLog('connect failed');
                    }
                } catch(e) {
                    this.updateLog('connect failed');
                    console.log(e);
                    // Show user-friendly error message for permission issues
                    if (e.message && (e.message.includes('Permission') || e.message.includes('permission'))) {
                        this.updateLog('Bluetooth permission denied. Please enable Bluetooth permissions in app settings.');
                        // Prompt user to go to settings
                        setTimeout(() => {
                            if (cordova.plugins.diagnostic) {
                                cordova.plugins.diagnostic.switchToSettings(() => {
                                    console.log("Switched to settings");
                                }, (error) => {
                                    console.log("Error opening settings: " + error);
                                });
                            }
                        }, 2000);
                    } else {
                        this.updateLog('Connection error: ' + e.message);
                    }
                }
            },
            startMonitoring() {
                // Clear any existing interval to prevent multiple intervals
                if (intevalId) {
                    clearInterval(intevalId);
                }

                intevalId = setInterval(async () => {
                    this.temp = await bluetoothService.getTemperature();
                }, 2000);
            },
            stopMonitoring() {
                clearInterval(intevalId);
            },
            async disconnect() {
                try{
                    this.stopMonitoring();
                    await bluetoothService.disconnect();
                    this.updateLog('disconnected');
                    this.showList = true;
                    this.showContent = false;
                    this.temp = null; // Clear temperature data
                } catch(e) {
                    this.updateLog('err disconnect');
                    console.log(e)
                }
            },
            onRefresh() {
                this.updateLog('refresh');
                if(this.showList) {
                    this.getDeviceList();
                }
            },
            setBTDebug() {
                bluetoothService.setDebug(this.updateLog.bind(this))
            },
            updateLog(data) {
                this.debug += '\r\n' + data;
                var debugElement = document.querySelector(".debug p");
                if(debugElement) {
                    debugElement.scrollTop = debugElement.scrollHeight;
                }
            },
            async sendCustomCommand() {
                await bluetoothService.sendData(this.customCommand);
                this.customCommand = ''
            },
            toggleDebug() {
                this.showDebug = !this.showDebug;
            }
        },
        computed: {
            temperature() {
                if(this.temp) {
                    this.updateLog(this.temp);
                    let temp = parseInt(this.temp, 16);
                    return temp - 40 + ' °C';
                } return '';
            },
            background() {
                console.log(this.temperature);
                let value = this.temperature;
                if(!this.temperature || this.temperature < 0){
                    value = 0;
                } else if(this.temperature > 100) {
                    value = 100;
                }
                return getColor(value);
            }
          }
      });

      const vueApp = app.mount('#app');
      vueApp.setBTDebug();
      vueApp.getDeviceList();
  }


  