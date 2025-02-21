import fs from 'fs';


export default class fileTracker {
  #folderTrackers = [];
  constructor() {
  }

  async setWatchList(_folders) {
    this.#folderTrackers = _folders.map(r => new FolderTracker(r, this));
  }
}



class FolderTracker {
  folderPath;

  changeList = [];

  #renameStack = [];
  constructor(_folder, _parent) {
    console.log('Created FolderTracker for:', _folder);
    this.folderPath = _folder;
    
    fs.watch(this.folderPath, {recursive: true}, async (eventType, relativePath) => {
      let fullPath = this.folderPath + '/' + relativePath;
      if (relativePath.includes('.DS_Store')) return;

      // if (eventType !== 'change') return;
      switch (eventType)
      {
        case "change": // Content changed / created file
          this.changeList.push({
            type: "upload",
            path: fullPath
          });

          break;
        case "rename": // moved/renamed/removed
          let exists = await fs.existsSync(fullPath);
          if (!exists)
          { // Removed / renamed

            this.#renameStack.push({
              path: fullPath,
            });
          } else { // moved to / renamed to

            let fromManifold = this.#renameStack.pop();
            if (fromManifold) {
              this.changeList.push({
                type: "move/rename",
                fromPath: fromManifold.path,
                toPath: fullPath,
              })
            } else { // Created folder / moved file in from external location
               this.changeList.push({
                type: "upload",
                path: fullPath
              });
            }

            for (let item of this.#renameStack)
            {
              this.changeList.push({
                type: "remove",
                fromPath: item.path,
              })
            }

            this.#renameStack = [];
          }
          break
      }

      console.log(this.changeList);
    });
  }
}
