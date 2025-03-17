import fs from 'fs';
import { readdir } from 'node:fs/promises'
import Client from 'ssh2-sftp-client';
const MaxDepthReachedFolder = 'E_maxDepthReached'; //Symbol('E_maxDepthReached');
import FolderIndex from './folderIndex.js';


export default class FileServer {
  client;
  #config = {};
  #isSetup = false;
  index;

  get isConnected() {
    return this.#isSetup;
  }

  constructor(_config) {
    this.#config = _config;
    this.client = new Client();
  }

  async setup() {
    console.log(`Connecting to ${this.#config.server.host}:${this.#config.server.port}`);
    try {
      await this.client.connect(this.#config.server);
    } catch (err) {
      console.log('Failed to connect:', err);
      return;
    }
    this.#isSetup = true;

    // this.generateIndex().then(index => {this.index = index; console.log(this.index.print())});
  }

  async stop() {
    return await this.client.end();
  }
  async listRootFiles() {
    return await this.client.list(this.#config.server.remoteFolder);
  }

  async uploadFolder(_name, _watchedFolder = false) {
    let fullPath = _name.split(_watchedFolder).length > 0 ? _name : _watchedFolder + '/' + _name;
    if (!fs.existsSync(fullPath)) return console.log('Error, source file does not exist:', _name);
    console.log('[FS] upload folder:', fullPath);

    let contents = await this.#readLocalDir(fullPath);
    for (let item of contents)
    {
      if (!item.isFolder)
      {
        await this.uploadFile(fullPath + '/' + item.name, _watchedFolder);
        continue;
      } else {
        await this.uploadFolder(fullPath + '/' + item.name, _watchedFolder)
      }
    }
  }

   async #readLocalDir(_path) {
     return (await readdir(_path))
      // .filter(r => !this.#parent._isPathInIgnoreFolder(_path + '/' + r)) // TODO
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
  


  async uploadFile(_name, _watchedFolder = false) {
    let fullPath = _name.split(_watchedFolder).length > 0 ? _name : _watchedFolder + '/' + _name;
    let localName = _name.split(_watchedFolder).length > 1 ? _name.split(_watchedFolder)[1] : _name;
    if (!fs.existsSync(fullPath)) return console.log('Error, source file does not exist:', _name);
    console.log('[FS] upload file:', fullPath);
    let targetPath = this.#config.server.remoteFolder + '/' + localName;
    let parts = targetPath.split('/');
    let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    try {
      let exists = await this.client.exists(pathPath);
      if (!exists) await this.client.mkdir(pathPath, true);
      return await this.client.put(fullPath, targetPath);
    } catch (e) {
      console.log('! [FS] Error while uploading:', _name, e)
      return false;
    }
  }

  async renameOrMove(_fromPath, _toPath) {
    let remoteFromPath = this.#config.server.remoteFolder + '/' + _fromPath;
    let remoteToPath = this.#config.server.remoteFolder + '/' + _toPath;
    
    let parts = remoteToPath.split('/');
    let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    let exists = await this.client.exists(pathPath);
    if (!exists) await this.client.mkdir(pathPath, true);
    return await this.client.rename(remoteFromPath, remoteToPath);
  }



   async removeFile(_name, _watchedFolder) {
    let targetPath = this.#config.server.remoteFolder + '/' + _name;
    // let parts = targetPath.split('/');
    // let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    // let exists = await this.client.client.exists(pathPath);
    return await this.client.delete(targetPath);
  }




  async generateIndex() { 
    let map = new FolderIndex(this.#config.server.remoteFolder);
    let This = this;

    async function generateIndex(_folder, _depth) {
      if (_depth < 0) return MaxDepthReachedFolder;
      let fileObjs = await This.client.list(_folder);
      let promises = [];
      for (let fileObj of fileObjs)
      {
        if (fileObj.type === 'd') // Directory
        {
          promises.push(generateIndex(_folder + '/' + fileObj.name, _depth - 1));
          continue;
        }

        map.addFile(_folder + '/' + fileObj.name, fileObj.size);
      }
      await Promise.all(promises);
    }

    await generateIndex(this.#config.server.remoteFolder, this.#config.MaxDepth);
    return map;
  }
}