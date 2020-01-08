class BluetoothService {
    constructor() {
        this.deviceId = null;
        this.incomingMessage = null;
        this.error = null;
        this.regex = /([0-9A-Z]{2}\s[0-9A-Z]{2}\s[0-9A-Z]{2})/g;
        this.debug = () => {};
    }

    async getDevices() {
        return await this.promisify(bluetoothSerial.list.bind(bluetoothSerial))
    }

    async connectToDevice(uuid) {
        this.debug('connecting to ' + uuid);
        let result = false;
        try{
            await this.promisify(bluetoothSerial.connect.bind(bluetoothSerial, uuid));
            this.deviceId = uuid;
            result = true;
            console.log('connected');
        } catch(e) {
            console.log('error connect')
            result = false;
        }
        return result;
    }

    async disconnect() {
        await this.promisify(bluetoothSerial.unsubscribe.bind(bluetoothSerial));
        await this.promisify(bluetoothSerial.disconnect.bind(bluetoothSerial));
        this.deviceId = null;
    }

    async initElm() {
        if(!this.deviceId) {
            this.debug('no device id');
            return false;
        }
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
        await this.sendData('0105');
        let temp = await this.getAnswer();
        temp = temp.replace('0105', '');
        temp = temp.replace('>', '');
        return temp.trim();
    }

    async sendData(data) {
        this.debug('>' + data + '\r\n');
        return await this.promisify(bluetoothSerial.write.bind(bluetoothSerial, data + '\r\n'));
    }

    listen() {
        bluetoothSerial.subscribe('>', (data) => {
            this.debug('listen ' + data);
            console.log(data);
            this.incomingMessage = data;
        }, () => {console.log('error')});
    }

    async getAnswer() {
        return new Promise((res, rej) => {
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