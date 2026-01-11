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
    onDeviceReady: function() {
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
                temp: null,
                debug: '',
                customCommand: '',
                deviceId: null
             }
        },
        methods: {
            async getDeviceList() {
                try{
                    this.devices = [];
                    let devices = await bluetoothService.getDevices();
                    this.devices = devices;
                } catch(e) {
                    console.log(e);
                }
            },
            async selectDevice(device) {
                try{
                    this.updateLog(device)
                    // Stop any existing monitoring before reconnecting
                    this.stopMonitoring();

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


  