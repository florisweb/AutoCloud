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
    await FileIndexer.setup();

    console.log('Server:', Server.index.print());
    console.log('Local:', FileIndexer.folderTrackers.map(r => r.index.print()));
    sync();
})();




async function sync() {
    let trackers = FileIndexer.folderTrackers;
    await Promise.all(trackers.map(r => syncFolder(r)));

    // if (!foldersToBeUpdated.length) return;
    // await FileIndexer.updateIndex();
    // setTimeout(sync, 5000);
}


async function syncFolder(_tracker) {
    let differences = _tracker.index.difference(Server.index);
    console.log('diffs', differences);

    // Upload files
    for (let missingPath of differences.missingPaths)
    {
        let fullPath = _tracker.folderPath + '' + missingPath;
        
        if (await isFolder(fullPath)) 
        {
            await Server.uploadFolder(fullPath, _tracker.folderPath);
            continue;
        }

        await Server.uploadFile(fullPath, _tracker.folderPath);
    }

    // Remove excess files
    for (let missingPath of differences.extraPaths)
    {
        try {
            await Server.removeFile(missingPath);
        } catch(e) {
            console.log('Could not remove', missingPath, e);
        }     
    }

    let postDifferences = _tracker.index.difference(Server.index);
    if (postDifferences.missingPaths.length === 0 && postDifferences.extraPaths.length === 0) return false;
    console.log('[ERROR] Error while syncing: not all things are properly uploaded:', _tracker.fullPath, postDifferences, Server.index.print());
}


async function isFolder(_path) {
    let stat = fs.lstatSync(_path);
    return stat.isDirectory();
}

async function readDir(_path) {
    return (await readdir(_path))
        .filter(r => !FileIndexer._isPathInIgnoreFolder(_path + '/' + r))
        .map(r => {
            let fullPath = _path + '/' + r;
            let stat = fs.lstatSync(fullPath);
            return {
                name: r,
                fullPath: fullPath, 
                stat: stat, 
                isFolder: stat.isDirectory(), 
                size: stat.size
            }
        });
}



// async function sync() {


//     // let trackers = FileIndexer.folderTrackers;
//     // for (let tracker of trackers)
//     // {
//     //     let foldersToBeUpdated = tracker.listFoldersToBeUpdated();
//     //     console.log(foldersToBeUpdated);
//     //     for (let folder of foldersToBeUpdated)
//     //     {
//     //         console.log('going to upload folder:', folder);
//     //         await Server.uploadFolder(folder, tracker.folderPath);
//     //     }
//     // }

//     // if (!foldersToBeUpdated.length) return;
//     // await FileIndexer.updateIndex();
//     setTimeout(sync, 5000);
// }


async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}