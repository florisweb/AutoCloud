import fs from 'fs';
import FileServer from './fileServer.js';
import tagManager from './tagManager.js';
import fileIndexer from './fileIndexer.js';
import { dirname } from 'path';
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'url';

const __dirname = getCurDir();
export function getCurDir() {
    return dirname(fileURLToPath(import.meta.url));
}

const Config = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const Server = new FileServer(Config);
const TagManager = new tagManager();
const FileIndexer = new fileIndexer();



(async () => {
    await Server.setup();
    await TagManager.setup();
    FileIndexer.setExcludeList(TagManager.foldersToIgnore);
    FileIndexer.setWatchList(TagManager.foldersToSync)
    await FileIndexer.setup();

    console.log('Server:', Server.index.print());
    console.log('Local:', FileIndexer.folderTrackers.map(r => r.index.print()));
    sync();
})();




async function sync() {
    let trackers = FileIndexer.folderTrackers;
    await Promise.all(trackers.map(r => syncFolder(r)));

    await Server.disconnect();
    setTimeout(sync, Config.updateFrequency);
}


async function syncFolder(_tracker) {
    console.log('[Sync Folder]: Updating local index...');
    await _tracker.updateIndex();

    let differences = _tracker.index.difference(Server.index);
    console.log('index.local', _tracker.index.print(), 'server', Server.index.print(), 'diff', differences);

    if (differences.missingPaths.length === 0 && differences.extraPaths.length === 0) return console.log('[Sync Folder]: No changes, quiting sync procedure.'); // Nothing to do
    console.log('diffs', differences);

    let connected = await Server.connect();
    if (!connected) return;
    

    // Upload files
    console.log('[Syncing folder]: Uploading local files...');
    let promises = [];
    for (let missingPath of differences.missingPaths)
    {
        let fullPath = _tracker.folderPath + '' + missingPath;
        
        if (await isFolder(fullPath)) 
        {
            promises.push(Server.uploadFolder(fullPath, _tracker.folderPath));
            continue;
        }

        promises.push(Server.uploadFile(fullPath, _tracker.folderPath));
    }

    // Remove excess files
    console.log('[Syncing folder]: Removing excess files on server...');
    for (let missingPath of differences.extraPaths)
    {
        try {
            if (await Server.isFolder(missingPath))
            {
                promises.push(Server.removeFolder(missingPath));
            } else {
                promises.push(Server.removeFile(missingPath));
            }
        } catch(e) {
            console.log('Could not remove', missingPath, e);
        }     
    }

    await Promise.all(promises);
    Server.writeCachedIndex();
    
    let postDifferences = _tracker.index.difference(Server.index);
    if (postDifferences.missingPaths.length === 0 && postDifferences.extraPaths.length === 0) return console.log('[Syncing folder]: Finished.');
    console.log('[ERROR] Error while syncing: not all things are properly uploaded:', _tracker.fullPath, postDifferences, Server.index.print());
}


async function isFolder(_path) {
    let stat = fs.lstatSync(_path);
    return stat.isDirectory();
}

async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}