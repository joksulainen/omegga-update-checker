import { OmeggaPlugin, OL, PS, PC } from 'omegga';
import fetch from 'node-fetch';


// plugin config and storage
type Config = {};
type Storage = {};

// plugin version here for convenience
const PLUGIN_VERSION = '0.1.0';

// types to help with type safety
type PluginUpdateInfo = GHPluginUpdateInfo | GLPluginUpdateInfo;

type GHPluginUpdateInfo = {
  _check_count?: number
  version: string
  api_type: 'github'
  repo_info: {
    owner: string
    repo: string
  }
};

type GLPluginUpdateInfo = {
  _check_count?: number
  version: string
  api_type: 'gitlab'
  repo_info: {
    project_id: string
  }
};

// helper functions
function semverIsGreater(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { numeric: true }) > 0;
}

function isPluginUpdateInfo(updateInfo: PluginUpdateInfo): updateInfo is PluginUpdateInfo {
  return updateInfo.api_type === 'github' || updateInfo.api_type === 'gitlab';
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  
  plugins: Record<string, PluginUpdateInfo>;
  interval: NodeJS.Timeout;
  
  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    
    this.plugins = {};
    
    this.updateCheckerCallback = this.updateCheckerCallback.bind(this);
    this.checkUpdate = this.checkUpdate.bind(this);
    this.pluginStatusCallback = this.pluginStatusCallback.bind(this);
  }
  
  async updateCheckerCallback() {
    Object.entries(this.plugins).forEach(([name, info]) => {
      this.checkUpdate(name, info);
    });
  }
  
  async checkUpdate(name: string, info: PluginUpdateInfo) {
    let response: fetch.Response | void = undefined;
    
    // fetch the latest release from the respective platform
    if (info.api_type === 'github') {
      response = await fetch(`https://api.github.com/repos/${info.repo_info.owner}/${info.repo_info.repo}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }).catch(() => {
        console.error(`Failed to fetch release data for \x1b[92m${name}\x1b[0m`);
      });
    }
    else if (info.api_type === 'gitlab') {
      response = await fetch(`https://gitlab.com/api/v4/projects/${info.repo_info.project_id}/releases/permalink/latest`, {
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch(() => {
        console.error(`Failed to fetch release data for \x1b[92m${name}\x1b[0m`);
      });
    }
    
    // stop if there is no response
    if (!response) return;
    const data = await response.json();
    
    // we probably shouldnt continue if its a pre-release
    if (data['prerelease']) return;
    
    // see if the tag name contains a semver and grab it, otherwise end early
    const remoteVersionMatch = ((data['tag_name'] as string).match(/^.*((?:\d+)\.(?:\d+)\.(?:\d+)).*$/));
    if (!remoteVersionMatch) return;
    const remoteVersion = remoteVersionMatch[1];
    
    // proceed if remoteVersion is a string and is a greater semver than info.version
    if (typeof remoteVersion !== 'string') return;
    if (!semverIsGreater(remoteVersion, info.version)) return;
    
    // there is a newer version available on remote, we should log it
    this.omegga.broadcast(`[<color="#AAFFAA">${name}</>]: A new version is available: ${info.version} -> ${remoteVersion}`);
    console.info(`A new version for \x1b[92m${name}\x1b[0m is available: ${info.version} -> ${remoteVersion}`);
  }
  
  async pluginEvent(event: string, from: string, info?: PluginUpdateInfo) {
    // a plugin wants to be checked for updates
    if (event === 'hook') {
      // check if the plugin has already hooked
      if (from in this.plugins) {
        console.log(`Plugin \x1b[92m${from}\x1b[0m has already hooked into update-checker`);
        return;
      }
      
      // do some data validation to make sure plugins dont provide garbage data
      if (!info) {
        console.error(`Plugin \x1b[92m${from}\x1b[0m did not provide update info to be hooked`);
        return;
      }
      
      const semverMatch = info.version.match(/^(?:\d+)\.(?:\d+)\.(?:\d+)$/);
      if (!semverMatch) {
        console.error(`Plugin \x1b[92m${from}\x1b[0m version isn't a valid semantic version`);
        return;
      }
      
      if (!isPluginUpdateInfo(info)) {
        console.error(`Plugin \x1b[92m${from}\x1b[0m update info doesn't match type`);
        return;
      }
      
      // all validation has passed, add plugin to record
      this.plugins[from] = info;
      console.log(`Plugin \x1b[92m${from}\x1b[0m hooked into update-checker`);
    }
    // a plugin no longer wants to be checked for updates
    else if (event === 'unhook') {
      // check if the plugin isnt hooked
      if (!(from in this.plugins)) {
        console.log(`Plugin \x1b[92m${from}\x1b[0m isn't hooked into update-checker`);
        return;
      }
      
      // unhook plugin
      delete this.plugins[from];
      console.log(`Plugin \x1b[92m${from}\x1b[0m unhooked from update-checker`);
    }
  }
  
  // plugin hook clean up on plugin unload
  async pluginStatusCallback(name: string, plugin: { name: string, isLoaded: boolean, isEnabled: boolean }) {
    if (!(name in this.plugins) || plugin.isLoaded) return;
    
    delete this.plugins[name];
    console.log(`Plugin \x1b[92m${name}\x1b[0m was unloaded and unhooked from update-checker`);
  }
  
  async init() {
    // add this plugins update info
    this.plugins['update-checker'] = {
      version: PLUGIN_VERSION,
      api_type: 'github',
      repo_info: { owner: 'joksulainen', repo: 'omegga-update-checker' },
    };
    
    // notify other plugins that this plugin is ready to receive hooks
    this.omegga.emit('uc:ready');
    
    // add listener for hook clean up
    this.omegga.on('plugin:status', this.pluginStatusCallback);
    
    // add an interval as well as trigger the callback after a delay to do a first check
    this.interval = setInterval(this.updateCheckerCallback, 14400000); // every 4 hours: 4*60*60*1000
    setTimeout(this.updateCheckerCallback, 1000);
    
    return {};
  }
  
  async stop() {
    clearInterval(this.interval);
  }
}
