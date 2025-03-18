import fs from 'fs';
import { readdir } from 'node:fs/promises'
import FolderIndex from './folderIndex.js';

export default class fileIndexer {
  #folderTrackers = [];
  #exludedFoldersList = [];

  get folderTrackers() {
    return this.#folderTrackers;
  }
  get index() {
    let index = {};
    this.#folderTrackers.forEach(r => index[r.folderPath] = r.index);
    return index;
  }
  get foldersToBeUpdated() {
    let folders = []
    this.#folderTrackers.forEach(r => folders = folders.concat(r.listFoldersToBeUpdated()));
    return folders;
  }

  async setup() {
    await Promise.all(this.#folderTrackers.map(r => r.setup()))
  }

  async setWatchList(_folders) {
    this.#folderTrackers = _folders.map(r => new FolderIndexer(r, this));
  }
  setExcludeList(_folders) {
    this.#exludedFoldersList = [..._folders, '.DS_Store'];
  }
  _isPathInIgnoreFolder(_path) {
    return !!this.#exludedFoldersList.find(r => _path.includes(r));
  }

  async updateIndex() {
    return Promise.all(this.#folderTrackers.map(r => r.updateIndex()));
  }

  async generateFileMap() {
    let promises = [];
    let map = {};
    for (let folder of this.#folderTrackers)
    {
      promises.push(folder.generateFileMap().then(folderMap => map[folder.folderPath] = folderMap));
    }
    await Promise.all(promises);
    return map;
  }
}

const MaxDepth = 30;
class FolderIndexer {
  folderPath;

  index;
  #parent;
  constructor(_folder, _parent) {
    this.folderPath = _folder;
    this.#parent = _parent;

    fs.watch(this.folderPath, {recursive: true}, async (eventType, relativePath) => {
      let fullPath = this.folderPath + '/' + relativePath;
      if (relativePath.includes('.DS_Store') || _parent._isPathInIgnoreFolder(fullPath)) return;

      let parts = fullPath.split('/');
      let containingFolderPath = parts.splice(0, parts.length - 1).join('/');

      this.index.markPathForUpdate(containingFolderPath);
    });
  }

  async setup() {
    this.index = await this.generateIndex();
  }



  async updateIndex(_force = false) {
    return this.#recursiveUpdateFolder(this.folderPath);
  }

  async #recursiveUpdateFolder(_curPath) {
    const This = this;

    let curFolder = this.index.getFolderFromPath(_curPath);
    if (curFolder.needsUpdate) 
    {
      curFolder.contents = [];
      curFolder.needsUpdate = false;
      await updateIndexOnPath(_curPath, MaxDepth);
      return;
    }
    for (let item in curFolder.contents)
    {
      let newPath = _curPath + '/' + item;
      await this.#recursiveUpdateFolder(newPath);
    }

    async function updateIndexOnPath(_folder, _depth) {
      if (_depth < 0) return;
      let fileObjs = await This.#readDir(_folder);
      let promises = [];
      for (let fileObj of fileObjs)
      {
        if (fileObj.isFolder) // Directory
        {
          promises.push(updateIndexOnPath(_folder + '/' + fileObj.name, _depth - 1));
          continue;
        }
        This.index.addFile(_folder + '/' + fileObj.name, fileObj.size);
      }
      await Promise.all(promises);
    }
  }

  // listFoldersToBeUpdated() {
  //   return this.#listFoldersToBeUpdated(this.folderPath);
  // }

  // #listFoldersToBeUpdated(_curPath) {
  //   let curFolder = this.#getFolderFromPath(_curPath);
  //   if (curFolder.needsUpdate) return [_curPath]
  //   let foldersToBeUpdated = [];
  //   for (let item in curFolder.contents)
  //   {
  //     let newPath = _curPath + '/' + item;
  //     foldersToBeUpdated = foldersToBeUpdated.concat(this.#listFoldersToBeUpdated(newPath));
  //   }
  //   return foldersToBeUpdated;
  // }




  // async generateFileMap() {
  //   return this.#generateFileMap(this.folderPath, MaxDepth);
  // }

 

  // async #generateFileMap(_folder, _depth) { // Symlinks don't work
  //   let map = {contents: {}, needsUpdate: false};
  //   if (_depth < 0) return MaxDepthReachedFolder; // Symbol
  //   let fileObjs = await this.#readDir(_folder);
  //   let promises = [];
  //   for (let fileObj of fileObjs)
  //   {
  //     if (fileObj.isFolder) // Directory
  //     {
  //       promises.push(this.#generateFileMap(_folder + '/' + fileObj.name, _depth - 1).then((subMap) => {
  //         map.contents[fileObj.name] = subMap;
  //       }));
  //     } else map.contents[fileObj.name] = {size: fileObj.size}; //fileObj;
  //   }
  //   await Promise.all(promises);
  //   return map;
  // }



  async generateIndex() { // Symlinks don't work
    let map = new FolderIndex(this.folderPath);
    let This = this;

    async function generateIndex(_folder, _depth) {
      if (_depth < 0) return;
      let fileObjs = await This.#readDir(_folder);
      let promises = [];
      for (let fileObj of fileObjs)
      {
        if (fileObj.isFolder) // Directory
        {
          promises.push(generateIndex(_folder + '/' + fileObj.name, _depth - 1));
          continue;
        }

        map.addFile(_folder + '/' + fileObj.name, fileObj.size);
      }
      await Promise.all(promises);
    }

    await generateIndex(this.folderPath, MaxDepth);
    return map;
  }


  async #readDir(_path) {
    return (await readdir(_path))
      .filter(r => !this.#parent._isPathInIgnoreFolder(_path + '/' + r))
      .map(r => {
        let fullPath = _path + '/' + r;
        let stat = fs.lstatSync(fullPath);
        return {
          name: r,
          fullPath: fullPath, 
          stat: stat, 
          isFolder: stat.isDirectory(), 
          size: stat.size}
      }
    );
  }
}



