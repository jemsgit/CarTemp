class BluetoothService {
    constructor() {
        this.deviceId = null;
        this.incomingMessage = null;
        this.debug = () => {}
    }

    async getDevices() {
        return await this.promisify(bluetoothSerial.list.bind(bluetoothSerial))
    }

    async connectToDevice(uuid) {
        let result = false;
        try{
            let connected = await this.promisify(bluetoothSerial.connect.bind(bluetoothSerial, uuid));
            this.deviceId = uuid;
            result = true;
            console.log('connected');
            console.log(connected)
        } catch(e) {
            console.log('error connect')
            result = false;
        }
        return result;
    }

    async disconnect() {
        let result = await this.promisify(bluetoothSerial.disconnect.bind(bluetoothSerial));
        if(result) {
            this.deviceId = null;
        }
        return result;
    }

    async initElm() {
        if(!this.deviceId) {
            return false;
        }
        let answer;
        this.listen();
        await this.sendData('ATZ');
        await this.getAnswer();
        await this.sendData('ATSP0');
        await this.getAnswer();
        await this.sendData('0100');
        answer = await this.getAnswer();
        while(answer.includes('SEARCHING')) {
            answer = await this.getAnswer();
        }
    }

    async getTemperature() {
        await this.sendData('0105');
        let temp = await this.getAnswer();
        temp = temp.split(' ');
        return temp[temp.length - 1];
    }

    async sendData(data) {
        this.debug('>>' + data);
        return await this.promisify(bluetoothSerial.write.bind(bluetoothSerial, data));
    }

    listen() {
        let promise = this.promisify(bluetoothSerial.subscribe.bind(bluetoothSerial, '\n'));
        promise.then((data) => {
            console.log(data);
            this.incomingMessage = data;
        })
    }

    async getAnswer() {
        return new Promise((res, rej) => {
            let intId = setInterval(() => {
                if(this.incomingMessage) {
                    res(this.incomingMessage);
                    this.debug('<<' + this.incomingMessage);
                    this.incomingMessage = null;
                    cleatInteval(intId);
                }
            }, 200)
        })
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