import fs from 'node:fs';

import { OmeggaPlugin, OL, PS, PC } from './omegga';
import { PLUGIN_ANSI, ansiWrapper, PLUGIN_FOLDER } from './common';
import { UpdateProvider, PluginUpdateInfo } from './update_provider';


// plugin config and storage
type Config = {
  notify_in_chat: boolean,
  check_interval: number,
  first_check_delay: number,
  ignored_plugins: string[],
};

type Storage = {};

// types to help with type safety
type UpdatePromiseReturn = {
  name: string,
  local_ver: string,
  remote_ver: string,
};

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  
  interval: NodeJS.Timeout | undefined;
  providers: Record<string, UpdateProvider>;
  
  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    
    this.providers = {};
    
    this.updateCheckerCallback = this.updateCheckerCallback.bind(this);
    this.checkUpdate = this.checkUpdate.bind(this);
  }
  
  async updateCheckerCallback() {
    // get all plugins in the plugins directory
    const plugins = fs.readdirSync(PLUGIN_FOLDER + '/');
    const promises = Array<Promise<UpdatePromiseReturn | undefined>>();
    
    // perform update checks and clean up any stale hooks while at it
    for (const plugin of plugins) {
      // is the plugin ignored in the config?
      if (this.config.ignored_plugins.includes(plugin)) continue;
      
      // check if the plugin has a uc-info.json file and load it, otherwise the plugin does not use this plugin
      if (!fs.existsSync(`${PLUGIN_FOLDER}/${plugin}/uc-info.json`)) continue;
      
      const uInfo = JSON.parse(fs.readFileSync(`${PLUGIN_FOLDER}/${plugin}/uc-info.json`, 'utf-8').toString());
      if (!(uInfo.api_type in this.providers)) { // check if there is a corresponding provider
        console.warn(`${ansiWrapper(PLUGIN_ANSI, plugin)} specified provider (${uInfo.api_type}) isn't loaded, skipping`);
        continue;
      }
      if (!this.providers[uInfo.api_type].isValidUpdateInfo(uInfo)) {
        console.warn(`${ansiWrapper(PLUGIN_ANSI, plugin)} uc-info.json is malformed, skipping`);
        continue;
      }
      
      // perform the update check
      promises.push(this.checkUpdate(plugin, uInfo));
    }
    
    const results = await Promise.allSettled(promises);
    
    const resultString = results.flatMap(r => r.status === 'fulfilled' && r.value ? [r.value] : [])
      .map(u => `${ansiWrapper(PLUGIN_ANSI, u.name)} ${u.local_ver} -> ${u.remote_ver}`).join(', ');
    
    if (resultString.length > 0) {
      if (this.config.notify_in_chat) {
        this.omegga.broadcast('<code><color="#AAFFAA">update-checker</></>: There are available updates for plugins. Check server console for details.');
      }
      console.info(`Available plugin updates: ${resultString}`);
    }
    else {
      console.info('No available plugin updates');
    }
  }
  
  async checkUpdate(name: string, uInfo: PluginUpdateInfo): Promise<UpdatePromiseReturn | undefined> {
    console.info(`Checking for updates to ${ansiWrapper(PLUGIN_ANSI, name)}`);
    
    // get the corresponding provider
    const provider = this.providers[uInfo.api_type];
    
    // run the provider specific code to check for an update
    const pluginUpdate = await provider.checkUpdate(name, uInfo);
    
    // pluginUpdate is null, there is no update
    if (!pluginUpdate) return;
    
    // a newer version is available
    return { name: name, ...pluginUpdate };
  }
  
  async init() {
    // add an interval as well as trigger the callback after a delay to do a first check
    this.interval = setInterval(this.updateCheckerCallback, this.config.check_interval * 60000); // 60*1000=60000
    setTimeout(this.updateCheckerCallback, this.config.first_check_delay * 1000);
    
    // populate providers map with update providers from the designated directory
    const providerModules = fs.readdirSync(`${PLUGIN_FOLDER}/update-checker/update_providers`);
    for (const module of providerModules) {
      const modStr = module.substring(0, module.length - 3);
      console.log(`Loading provider ${modStr}`);
      const mod = require(`./update_providers/${modStr}`);
      
      if (mod.default.id in this.providers) { // we dont want duplicates
        console.warn(`Skipping ${modStr}: there is already another loaded provider using the id ${mod.default.id}`);
        continue;
      }
      
      this.providers[mod.default.id] = mod.default;
      console.log(`Loaded provider ${modStr}`);
    }
    
    return {};
  }
  
  async stop() {
    clearInterval(this.interval);
  }
}
