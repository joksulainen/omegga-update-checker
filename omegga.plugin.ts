import { OmeggaPlugin, OL, PS, PC } from 'omegga';
import fetch from 'node-fetch';


// plugin config and storage
type Config = {
  notify_in_chat: boolean
  check_interval: number
  first_check_delay: number
  ignored_plugins: string[]
};

type Storage = {};

// update checker info
const UPDATE_INFO = {
  version: '0.1.0',
  api_type: 'github',
  repo_info: { owner: 'joksulainen', repo: 'omegga-update-checker' },
} as GHPluginUpdateInfo;

// types to help with type safety
type PluginUpdateInfo = GHPluginUpdateInfo | GLPluginUpdateInfo;

type GHPluginUpdateInfo = {
  version: string
  api_type: 'github'
  repo_info: {
    owner: string
    repo: string
  }
};

type GLPluginUpdateInfo = {
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

function ansiWrapper(ansi: string, string: string): string {
  return ansi + string + '\x1b[0m';
}

// const for plugin ansi color
const PLUGIN_ANSI = '\x1b[92m';

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
  }
  
  async updateCheckerCallback() {
    // perform update checks and clean up any stale hooks while at it
    for (const [pName, uInfo] of Object.entries(this.plugins)) {
      // check if its a stale hook and clean it up
      const plugin = await this.omegga.getPlugin(pName);
      if (!plugin || !plugin.loaded) {
        delete this.plugins[pName];
        console.warn(`Removed stale hook for ${ansiWrapper(PLUGIN_ANSI, pName)}`);
        continue;
      }
      
      // is the plugin ignored in the config?
      if (pName in this.config.ignored_plugins) continue;
      
      // perform the update check
      this.checkUpdate(pName, uInfo);
    }
  }
  
  async checkUpdate(name: string, info: PluginUpdateInfo) {
    let response: fetch.Response | void = undefined;
    
    console.info(`Checking for updates to ${ansiWrapper(PLUGIN_ANSI, name)}`);
    
    // fetch the latest release from the respective platform
    if (info.api_type === 'github') {
      response = await fetch(`https://api.github.com/repos/${info.repo_info.owner}/${info.repo_info.repo}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }).catch(() => {
        console.warn(`Failed to fetch release data for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      });
    }
    else if (info.api_type === 'gitlab') {
      response = await fetch(`https://gitlab.com/api/v4/projects/${info.repo_info.project_id}/releases/permalink/latest`, {
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch(() => {
        console.warn(`Failed to fetch release data for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      });
    }
    
    // stop if there is no response
    if (!response || !response.ok) {
      console.warn(`Failed to fetch release data for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      return;
    }
    const data = await response.json();
    
    // we probably shouldnt continue if its a pre-release
    if (data['prerelease'] || data['upcoming_release']) {
      console.info(`No updates available for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      return;
    }
    
    // see if the tag name contains a stable semver and grab it, otherwise end early
    const remoteVersionMatch = ((data['tag_name'] as string).match(/^.*((?:\d+)\.(?:\d+)\.(?:\d+))$/));
    if (!remoteVersionMatch) {
      console.info(`No updates available for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      return;
    }
    const remoteVersion = remoteVersionMatch[1];
    
    // proceed if remoteVersion is a greater semver than info.version
    if (!semverIsGreater(remoteVersion, info.version)) {
      console.info(`No updates available for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      return;
    }
    
    // there is a newer version available on remote, we should log it
    if (this.config.notify_in_chat) {
      this.omegga.broadcast(`<code><color="#AAFFAA">${name}</></>: A new version is available: ${info.version} -> ${remoteVersion}`);
    }
    
    console.info(`A new version of ${ansiWrapper(PLUGIN_ANSI, name)} is available: ${info.version} -> ${remoteVersion}`);
  }
  
  async pluginEvent(event: string, from: string, args: any[]) {
    // a plugin wants to be checked for updates
    if (event === 'hook') {
      // do some data validation to make sure plugins dont provide garbage data
      if (!args.length) {
        console.error(`Plugin ${ansiWrapper(PLUGIN_ANSI, from)} did not provide update info to be hooked`);
        return;
      }
      
      const info = args[0];
      
      if (!isPluginUpdateInfo(info)) {
        console.error(`Plugin ${ansiWrapper(PLUGIN_ANSI, from)} update info doesn't match type`);
        return;
      }
      
      const semverMatch = info.version.match(/^(?:\d+)\.(?:\d+)\.(?:\d+)$/);
      if (!semverMatch) {
        console.error(`Plugin ${ansiWrapper(PLUGIN_ANSI, from)} version isn't a valid semantic version`);
        return;
      }
      
      // all validation has passed, add plugin to record
      console.log(from in this.plugins
        ? `Plugin ${ansiWrapper(PLUGIN_ANSI, from)} updated its update information` 
        : `Plugin ${ansiWrapper(PLUGIN_ANSI, from)} hooked into update-checker`,
      );
      
      this.plugins[from] = info;
    }
    // a plugin no longer wants to be checked for updates
    else if (event === 'unhook') {
      // check if the plugin isnt hooked
      if (!(from in this.plugins)) {
        console.log(`Plugin ${ansiWrapper(PLUGIN_ANSI, from)} isn't hooked into update-checker`);
        return;
      }
      
      // unhook plugin
      delete this.plugins[from];
      console.log(`Plugin ${ansiWrapper(PLUGIN_ANSI, from)} unhooked from update-checker`);
    }
  }
  
  async init() {
    // add this plugins update info
    this.plugins['update-checker'] = UPDATE_INFO;
    
    // notify other plugins that this plugin is ready to receive hooks
    // ... if it could be done
    
    // add an interval as well as trigger the callback after a delay to do a first check
    this.interval = setInterval(this.updateCheckerCallback, this.config.check_interval * 60000); // 60*1000=60000
    setTimeout(this.updateCheckerCallback, this.config.first_check_delay * 1000);
    
    return {};
  }
  
  async stop() {
    clearInterval(this.interval);
  }
}
