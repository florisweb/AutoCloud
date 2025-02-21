import fs from 'fs';
import FileServer from './FileServer.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = getCurDir();

export function getCurDir() {
    return dirname(fileURLToPath(import.meta.url));
}

const Config = JSON.parse(fs.readFileSync('./config.json'));
const Server = new FileServer(Config);

(async () => {
    await Server.setup();
    console.log(await Server.listRootFiles());
})();


let curChangePromise;
for (let watchedFolder of Config.local.watchedFolders) 
{
    fs.watch(watchedFolder, {recursive: true}, async (eventType, relativePath) => {
        if (!Server.isConnected) return;
        if (eventType !== 'change') return;

        while (curChangePromise) await curChangePromise;
        if (fs.existsSync(watchedFolder + '/' + relativePath))
        {
            curChangePromise = Server.uploadFile(relativePath, watchedFolder);
        } else {
            curChangePromise = Server.deleteFile(relativePath, watchedFolder);
        }
        await curChangePromise;
        curChangePromise = false;
    });
}

async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}