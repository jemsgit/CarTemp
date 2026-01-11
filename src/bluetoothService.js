class BluetoothService {
    constructor() {
        this.deviceId = null;
        this.incomingMessage = null;
        this.error = null;
        this.regex = /([0-9A-Z]{2}\s[0-9A-Z]{2}\s[0-9A-Z]{2})/g;
        this.debug = () => {};
        this.subscriptionActive = false;
    }

    async getDevices() {
        return await this.promisify(bluetoothSerial.list.bind(bluetoothSerial))
    }

    async connectToDevice(uuid) {
        this.debug('connecting to ' + uuid);
        let result = false;
        try{
            // Ensure we're disconnected from any previous connections
            if (this.deviceId) {
                await this.disconnect();
            }

            await this.promisify(bluetoothSerial.connect.bind(bluetoothSerial, uuid));
            this.deviceId = uuid;
            result = true;
            console.log('connected');
        } catch(e) {
            console.log('error connect', e)
            result = false;
        }
        return result;
    }

    async disconnect() {
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
        this.debug('>' + data + '\r\n');
        return await this.promisify(bluetoothSerial.write.bind(bluetoothSerial, data + '\r\n'));
    }

    listen() {
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