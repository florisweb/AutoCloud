import { exec } from 'child_process';

export default class tagManager {
    #SyncTagName = 'AutoCloud.sync'; // Labels folder to be synced
    #NoSyncTagName = 'AutoCloud.noSync'; // Labels folder to be excluded from sync
 

    foldersToSync = [];
    async setup() {
        this.foldersToSync = await this.#getFilesWithTag(this.#SyncTagName);
        console.log('TagManager: folders to sync:', this.foldersToSync);
    }

    async #getFilesWithTag(_tag) {
        return new Promise((resolve) => {
            exec (`mdfind kMDItemUserTags=${_tag}`, (error, stdout, stderr ) => {
            if (error || stderr) return console.log('Error:', error, stderr);

                // var tags = stdout?.toString().split(",");
                let folders = (stdout.split('\n') || []).filter(r => !!r);
                resolve(folders);
            }); 
        });
    }
}
