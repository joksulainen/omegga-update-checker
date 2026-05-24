import fs from 'node:fs';

import fetch, { Response } from 'node-fetch';
import semver from 'semver';

import { OmeggaPlugin, OL, PS, PC } from 'omegga';
import { PLUGIN_ANSI, ansiWrapper } from 'common';
import { UpdateProvider } from 'update_provider';


// plugin config and storage
type Config = {
  notify_in_chat: boolean,
  check_interval: number,
  first_check_delay: number,
  ignored_plugins: string[],
};

type Storage = {};

// types to help with type safety
type PluginUpdateInfo = GHPluginUpdateInfo | GLPluginUpdateInfo;

type GHPluginUpdateInfo = {
  version: string,
  api_type: 'github',
  repo_info: {
    owner: string,
    repo: string,
  },
};

type GLPluginUpdateInfo = {
  version: string,
  api_type: 'gitlab',
  repo_info: {
    project_id: string,
  },
};

type UpdatePromiseReturn = {
  name: string,
  local_ver: string,
  remote_ver: string,
};

// helper functions
function isPluginUpdateInfo(updateInfo: PluginUpdateInfo): updateInfo is PluginUpdateInfo {
  return updateInfo.api_type === 'github' || updateInfo.api_type === 'gitlab';
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  
  interval: NodeJS.Timeout | undefined;
  providers: UpdateProvider[];
  
  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    
    this.providers = Array<UpdateProvider>();
    
    this.updateCheckerCallback = this.updateCheckerCallback.bind(this);
    this.checkUpdate = this.checkUpdate.bind(this);
  }
  
  async updateCheckerCallback() {
    // get all plugins in the plugins directory
    const plugins = fs.readdirSync('./plugins/');
    const promises = Array<Promise<UpdatePromiseReturn | undefined>>();
    
    // perform update checks and clean up any stale hooks while at it
    for (const plugin of plugins) {
      // is the plugin ignored in the config?
      if (this.config.ignored_plugins.includes(plugin)) continue;
      
      // check if the plugin has a uc-info.json file and load it, otherwise the plugin does not use this plugin
      if (!fs.existsSync(`./plugins/${plugin}/uc-info.json`)) continue;
      
      const uInfo = JSON.parse(fs.readFileSync(`./plugins/${plugin}/uc-info.json`, 'utf-8').toString());
      if (!isPluginUpdateInfo(uInfo)) { // check if the json conforms to the PluginUpdateInfo format
        console.warn(`${plugin} uc-info.json is malformed, skipping`);
        continue;
      }
      if (!semver.valid(uInfo.version)) {
        console.warn(`${plugin} version in uc-info.json is not a semver, skipping`);
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
    
    // fetch the latest release from the respective platform
    let response: Response | void = undefined;
    if (uInfo.api_type === 'github') {
      response = await fetch(`https://api.github.com/repos/${uInfo.repo_info.owner}/${uInfo.repo_info.repo}/releases/latest`, {
        headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
      }).catch((e) => {
        console.error(`Network error checking ${ansiWrapper(PLUGIN_ANSI, name)}:`, e);
        throw e;
      });
    }
    else if (uInfo.api_type === 'gitlab') {
      response = await fetch(`https://gitlab.com/api/v4/projects/${uInfo.repo_info.project_id}/releases/`, {
        headers: { 'Content-Type': 'application/json' },
      }).catch((e) => {
        console.error(`Network error checking ${ansiWrapper(PLUGIN_ANSI, name)}:`, e);
        throw e;
      });
    }
    
    // stop if there is no response
    if (!response || !response.ok) {
      console.warn(`Failed to fetch release data for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      throw new Error(`Failed to fetch release data for ${name}: ${response?.status} ${response?.statusText}`);
    }
    const data = await response.json();
    
    // filter data based on api type
    let remoteVersion: string | null = null;
    if (uInfo.api_type === 'github') {
      // see if the tag name contains a stable semver and grab it
      remoteVersion = semver.clean(data.tag_name);
    }
    else if (uInfo.api_type === 'gitlab') {
      for (const release of data) {
        // we shouldnt use an upcoming release
        if (release.upcoming_release) continue;
        
        // see if the tag name contains a stable semver and grab it
        remoteVersion = semver.clean(release.tag_name);
        break;
      }
    }
    
    // end if the semver is invalid
    if (!remoteVersion) return;
    
    // proceed if remoteVersion is a greater semver than info.version
    if (!semver.gt(remoteVersion, uInfo.version)) return;
    
    // a newer version is available
    return { name: name, local_ver: uInfo.version, remote_ver: remoteVersion };
  }
  
  async init() {
    // add an interval as well as trigger the callback after a delay to do a first check
    this.interval = setInterval(this.updateCheckerCallback, this.config.check_interval * 60000); // 60*1000=60000
    setTimeout(this.updateCheckerCallback, this.config.first_check_delay * 1000);
    
    return {};
  }
  
  async stop() {
    clearInterval(this.interval);
  }
}
