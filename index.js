const fs = require('fs');
const { exec, spawnSync } = require('child_process');
const PubNub = require('pubnub');
const queue = require('queue');

const configFile = fs.readFileSync('./config.json');
const config = JSON.parse(configFile);
const initImageFilename = 'init.ppm';
const { logo, initMessage, ledMatrix, pubnub } = config;

let q = queue();
q.autostart = true;
q.concurrency = 1;

let repeatMessage;

run(config).then(() => console.log('Cactus Pi Client Started!'));

async function run(config) {
  generateTextImage({
    text: initMessage,
    filename: initImageFilename,
    ledRows: ledMatrix.options.ledRows
  });

  const cmdDisplayLogo = `sudo ${ledMatrix.path}/utils/led-image-viewer ${logo} -w2 ./${initImageFilename} -w2 -C ${buildLedMatrixOptions(ledMatrix.options)}`;
  q.push(() => execCommand(cmdDisplayLogo));

  const pubNub = new PubNub({
    subscribeKey: pubnub.subscribeKey,
    secretKey: pubnub.secretKey,
    ssl: true
  });

  pubNub.subscribe({
    channels: pubnub.channels
  });

  pubNub.addListener({
    status: (statusEvent) => {
      if (statusEvent.category === "PNConnectedCategory") {
        console.log('PubNub', 'connected')
      } else if (statusEvent.category === "PNUnknownCategory") {
        const newState = { new: 'error' };
        pubNub.setState({ state: newState }, (status) => { console.error('PubNub', statusEvent.errorData.message) });
      }
    },
    message: (msg) => {
      console.log('PubNub', msg);
      q[msg.userMetadata.priority ? 'unshift' : 'push'](cb => {
        return new Promise((resolve, reject) => {
          sendToDisplayPanel({
            message: msg,
            imageFile: `${msg.userMetadata.name}.ppm`,
            ledMatrix
          }).then(res => {
            resolve(res);
          }).catch(err => {
            resolve(err);
          });
        });
      });
    }
  });

  q.on('success', (message, job) => {
    console.log('job finished processing', message);
    if (!message) {
      return;
    }

    const { repeat } = message.userMetadata;
    if (repeat) {
      repeatMessage = message;
    }

    loopMessage();
  });

  q.on('error', (error, job) => {
    console.error('job failed to execute', error);
  });

  q.start((err) => console.log('queue ended', err));
}

function loopMessage() {
  if (q.length === 0 && repeatMessage) {
    q.push(cb => {
      return new Promise((resolve, reject) => {
        sendToDisplayPanel({
          message: repeatMessage,
          imageFile: `${repeatMessage.userMetadata.name}.ppm`,
          ledMatrix
        }).then(res => {
          resolve(res);
        }).catch(err => {
          resolve(err);
        });
      });
    });
  }
}

function execCommand(cmd, message) {
  return new Promise((resolve, reject) => {
    const child = exec(cmd);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on('exit', (status) => {
      let msg = message;
      if (status !== 0) {
        console.error('command', cmd);
        msg = null;
      }
      resolve(msg);
    });
  });
}

async function sendToDisplayPanel({ message, imageFile, ledMatrix }) {
  generateTextImage({
    text: message.message,
    filename: imageFile,
    ledRows: ledMatrix.options.ledRows
  });

  const { duration } = message.userMetadata;
  const cmdDisplayMessage = `sudo ${ledMatrix.path}/examples-api-use/demo --led-rows=32 --led-chain=2 -t ${duration} -m 25 -D 1 ./${imageFile} ${buildLedMatrixOptions(ledMatrix.options)}`;
  return await execCommand(cmdDisplayMessage, message);
}

function generateTextImage({ text, filename, ledRows}) {
  const args = ["./generate-image.py", text, filename, ledRows];
  return spawnSync('python', args);
}

function buildLedMatrixOptions(options) {
  return `--led-rows=${options.ledRows} --led-chain=${options.ledChain} ${options.ledNoHardwarePulse ? '--led-no-hardware-pulse' : ''} --led-gpio-mapping=${options.ledGpioMapping}`;
}
