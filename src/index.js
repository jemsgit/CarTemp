import Vue from 'vue';
import VuePullRefresh from 'vue-pull-refresh';  
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

function createVueApp() {
    let vueApp = new Vue({
        el: '#app',
        data: function() {
            return {
                devices: [],
                showList: true,
                showContent: false,
                temp: null,
                debug: '',
                customCommand: ''
             }
        },
        methods: {
            getDeviceList: async function() {
                try{
                    this.devices = [];
                    let devices = await bluetoothService.getDevices();
                    this.devices = devices;
                } catch(e) {
                    console.log(e);
                }
            },
            selectDevice: async function(device) {
                try{
                    this.updateLog(device)
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
            startMonitoring: function() {
                intevalId = setInterval(async () => {
                    this.temp = await bluetoothService.getTemperature();
                }, 2000);
            },
            stopMonitoring: function() {
                clearInterval(intevalId);
            },
            disconnect: async function() {
                try{
                    this.stopMonitoring();
                    await bluetoothService.disconnect();
                    this.updateLog('disconnected');
                    this.showList = true;
                    this.showContent = false;
                } catch(e) {
                    this.updateLog('err disconnect');
                    console.log(e)
                }
            },
            onRefresh: function() {
                this.updateLog('refresh');
                if(this.showList) {
                    this.getDeviceList();
                }
            },
            setBTDebug: function() {
                bluetoothService.setDebug(this.updateLog.bind(this))
            },
            updateLog: function(data) {
                this.debug += '\r\n' + data;
            },
            sendCustomCommand: async function() {
                await bluetoothService.sendData(this.customCommand);
                this.customCommand = ''
            }
        },
        computed: {
            temperature: function () {
                if(this.temp) {
                    let temp = parseInt(this.temp, 16);
                    return temp - 40 + ' C';
                } return ''
            }
          }
      })
      vueApp.setBTDebug();
      vueApp.getDeviceList();
      
  }


  