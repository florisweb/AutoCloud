
import SFTPClient from './SFTPClient.js';

export default class FileServer {
  client;
  #config = {};
  #isSetup = false;
  get isConnected() {
    return this.#isSetup;
  }

  constructor(_config) {
    this.#config = _config;
    this.client = new SFTPClient();
  }

  async setup() {
    await this.client.connect(this.#config.server);
    this.#isSetup = true;
  }

  async stop() {
    return await this.client.disconnect();
  }
  async listRootFiles() {
    return await this.client.listFiles(this.#config.server.remoteFolder);
  }

  async uploadFile(_name, _watchedFolder) {
    let fullPath = _watchedFolder + '/' + _name;
    let targetPath = this.#config.server.remoteFolder + '/' + _name;
    let parts = targetPath.split('/');
    let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    let exists = await this.client.client.exists(pathPath);
    if (!exists) await this.client.client.mkdir(pathPath, true);
    return await this.client.uploadFile(fullPath, targetPath);
  }

   async deleteFile(_name, _watchedFolder) {
    let targetPath = this.#config.server.remoteFolder + '/' + _name;
    // let parts = targetPath.split('/');
    // let pathPath = parts.splice(0, parts.length - 1).join('/');
    
    // let exists = await this.client.client.exists(pathPath);
    return await this.client.deleteFile(targetPath);
  }
}