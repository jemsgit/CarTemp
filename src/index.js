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
                    console.log(devices);
                    this.devices = devices
                } catch(e) {
                    console.log(e)
                }
                
            },
            selectDevice: async function(device) {
                try{
                    await bluetoothService.connectToDevice(device.id);
                    this.deviceId = device.id;
                    this.showList = false;
                    this.showContent = true;
                    await bluetoothService.initElm();
                    this.temp = bluetoothService.getTemperature();
                } catch(e) {
                    console.log(e)
                }
            },
            disconnect: async function() {
                try{
                    await bluetoothService.disconnect();
                    this.showList = true;
                    this.showContent = false;
                } catch(e) {
                    console.log(e)
                }
            },
            onRefresh: function() {
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


  