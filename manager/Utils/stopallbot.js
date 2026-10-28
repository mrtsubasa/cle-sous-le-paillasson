const { exec } = require('child_process');
const path = require('path');
const { readJsonConfig, writeJsonConfig } = require('./tokenVault');

let check = false;

function stopallbot() {

    if(check === true) return;

    const configPath = path.join(__dirname, '..', 'config.json');
    const config = readJsonConfig(configPath, { migrateToken: true }) || { PID: [] };
    config.PID.forEach((pid) => {
        exec(`kill ${pid}`, () => {});
    });

    config.PID = [];
    writeJsonConfig(configPath, config);

    check = true;

}

module.exports = stopallbot;
