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
        await this.promisify(bluetoothSerial.disconnect.bind(bluetoothSerial));
        await this.promisify(bluetoothSerial.unsubscribe.bind(bluetoothSerial));
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
        this.debug('got answer ATZ');
        this.debug(answer);
        await this.sendData('ATSP0');
        answer = await this.getAnswer();
        this.debug('got answer ATSP0');
        this.debug(answer);
        await this.sendData('0100');
        answer = await this.getAnswer();
        this.debug('got answer 0100');
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
        return await this.promisify(bluetoothSerial.write.bind(bluetoothSerial, data + '\r\n'));
    }

    listen() {
        let promise = this.promisify(bluetoothSerial.subscribe.bind(bluetoothSerial, '\n'));
        promise.then((data) => {
            this.debug('listen ' + data);
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