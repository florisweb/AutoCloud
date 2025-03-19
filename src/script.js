import fs from 'fs';
import FileServer from './fileServer.js';
import tagManager from './tagManager.js';
import fileIndexer from './fileIndexer.js';
import { dirname } from 'path';
import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const Config = JSON.parse(fs.readFileSync(__dirname + '/config.json'));
const Server = new FileServer(Config);
const TagManager = new tagManager();
const FileIndexer = new fileIndexer();


const AutoCloud = new class {
    async setup() {
        await Server.setup();
        await TagManager.setup();
        FileIndexer.setExcludeList(TagManager.foldersToIgnore);
        FileIndexer.setWatchList(TagManager.foldersToSync)
        await FileIndexer.setup();
        Server.setFolderTrackers(FileIndexer.folderTrackers);


        console.log('Server:', Server.index.print());
        console.log('Local:', FileIndexer.folderTrackers.map(r => r.index.print()));
        this.sync();
    }


    async sync() {
        let trackers = FileIndexer.folderTrackers;
        await Promise.all(trackers.map(r => this.syncFolder(r)));

        await Server.disconnect();
        setTimeout(() => this.sync(), Config.updateFrequency);
    }


    async syncFolder(_tracker) {
        console.log('[Sync Folder]: Updating local index...');
        await _tracker.updateIndex();

        let differences = _tracker.index.difference(Server.index, '/' + _tracker.remotePath);
        if (differences.missingPaths.length === 0 && differences.extraPaths.length === 0) return console.log('[Sync Folder]: No changes, quiting sync procedure.'); // Nothing to do
        console.log('diffs', differences);

        let connected = await Server.connect();
        if (!connected) return;
        

        // Upload files
        console.log('[Syncing folder]: Uploading local files...');
        let promises = [];
        for (let missingPath of differences.missingPaths)
        {
            let fullPath = _tracker.folderPath + '/' + missingPath;
            if (await isFolder(fullPath)) 
            {
                promises.push(_tracker.server.uploadFolder(missingPath));
                continue;
            }

            promises.push(_tracker.server.uploadFile(missingPath));
        }

        // Remove excess files
        console.log('[Syncing folder]: Removing excess files on server...');
        for (let extraPath of differences.extraPaths)
        {
            try {
                if (await _tracker.server.isFolder(extraPath))
                {
                    promises.push(_tracker.server.removeFolder(extraPath));
                } else {
                    promises.push(_tracker.server.removeFile(extraPath));
                }
            } catch(e) {
                console.log('Could not remove', extraPath, e);
            }     
        }

        await Promise.all(promises);
        Server.writeCachedIndex();

        let postDifferences = _tracker.index.difference(Server.index, '/' + _tracker.remotePath);
        if (postDifferences.missingPaths.length === 0 && postDifferences.extraPaths.length === 0) return console.log('[Syncing folder]: Finished.');
        console.log('[ERROR] Error while syncing: not all things are properly uploaded:', _tracker.fullPath, postDifferences, Server.index.print());
    }

}


AutoCloud.setup();

async function isFolder(_path) {
    let stat = fs.lstatSync(_path);
    return stat.isDirectory();
}

async function wait(_ms) {
    return new Promise((resolve) => setTimeout(resolve, _ms));
}