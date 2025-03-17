import fs from 'fs';
import FileServer from './fileServer.js';
import tagManager from './tagManager.js';
import fileIndexer from './fileIndexer.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = getCurDir();

export function getCurDir() {
    return dirname(fileURLToPath(import.meta.url));
}

const Config = JSON.parse(fs.readFileSync('./config.json'));
const Server = new FileServer(Config);
const TagManager = new tagManager();
const FileIndexer = new fileIndexer();


let phantomDataMap = [{}];
(async () => {
    await Server.setup();
    await TagManager.setup();
    FileIndexer.setExcludeList(TagManager.foldersToIgnore);
    FileIndexer.setWatchList(TagManager.foldersToSync)

    let remoteMap = await Server.generateIndex();
    let localMap = await FileIndexer.folderTrackers[0].generateIndex();
    console.log(remoteMap.print(), localMap.print(), localMap.difference(remoteMap));
    // setTimeout(sync, 5000);
})();


async function sync() {
    let trackers = FileIndexer.folderTrackers;
    for (let tracker of trackers)
    {
        let foldersToBeUpdated = tracker.listFoldersToBeUpdated();
        console.log(foldersToBeUpdated);
        for (let folder of foldersToBeUpdated)
        {
            console.log('going to upload folder:', folder);
            await Server.uploadFolder(folder, tracker.folderPath);
        }
    }

    // if (!foldersToBeUpdated.length) return;
    await FileIndexer.updateIndex();
    setTimeout(sync, 5000);
}


async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}