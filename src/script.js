import fs from 'fs';
import FileServer from './fileServer.js';
import tagManager from './tagManager.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = getCurDir();

export function getCurDir() {
    return dirname(fileURLToPath(import.meta.url));
}

const Config = JSON.parse(fs.readFileSync('./config.json'));
const Server = new FileServer(Config);
const TagManager = new tagManager();

(async () => {
    await Server.setup();
    await TagManager.setup();

    let curChangePromise;
    for (let watchedFolder of TagManager.foldersToSync) 
    {
        console.log('Watching ' + watchedFolder);
        fs.watch(watchedFolder, {recursive: true}, async (eventType, relativePath) => {
            console.log('change', eventType, relativePath);
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


})();

async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}