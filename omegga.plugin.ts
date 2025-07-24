import { OmeggaPlugin, OL, PS, PC } from 'omegga';
import fetch from 'node-fetch';


// plugin config and storage
type Config = {};
type Storage = {};

// helper functions
function semverIsGreater(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { numeric: true }) > 0;
}

export default class Plugin implements OmeggaPlugin<Config, Storage> {
  omegga: OL;
  config: PC<Config>;
  store: PS<Storage>;
  
  plugins: Set<string>;
  interval: NodeJS.Timeout;
  
  constructor(omegga: OL, config: PC<Config>, store: PS<Storage>) {
    this.omegga = omegga;
    this.config = config;
    this.store = store;
    
    this.plugins = new Set();
    
    this.updateCheckerCallback = this.updateCheckerCallback.bind(this);
  }
  
  async updateCheckerCallback() {
    // fetch the latest release from github
    const data = await (await fetch(REMOTE_URL, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })).json();
    
    // we probably shouldnt continue if its a pre-release
    if (data['prerelease']) return;
    
    // see if the tag name contains a semver and grab it, otherwise end early
    const remoteVersionMatch = ((data['tag_name'] as string).match(/^.*((?:\d+)\.(?:\d+)\.(?:\d+)).*$/));
    if (!remoteVersionMatch) return;
    const remoteVersion = remoteVersionMatch[1];
    
    // proceed if githubVersion is a string and is a greater semver than PLUGIN_VERSION
    if (typeof remoteVersion !== 'string') return;
    if (!semverIsGreater(remoteVersion, PLUGIN_VERSION)) return;
    
    // there is a newer version available on github, we should log it
    this.omegga.broadcast(`[<color="#AAFFAA">rolelogger</>]: A new version is available: ${PLUGIN_VERSION} -> ${remoteVersion}`);
    console.info(`A new version is available: ${PLUGIN_VERSION} -> ${remoteVersion}`);
  }
  
  async pluginEvent(event: string, from: string, ..._args: any[]) {
    
  }
  
  async init() {
    // Write your plugin!
    this.omegga.on('cmd:test', (speaker: string) => {
      this.omegga.broadcast(`Hello, ${speaker}!`);
    });
    
    // emit event so plugins know that this plugin is ready to receive hooks
    this.omegga.emit('uc:ready');
    
    // add an interval as well as trigger the callback after a delay to do a first check
    this.interval = setInterval(this.updateCheckerCallback, 14400000); // every 4 hours: 4*60*60*1000
    setTimeout(this.updateCheckerCallback, 1000);
    
    return { registeredCommands: ['test'] };
  }
  
  async stop() {
    clearInterval(this.interval);
  }
}
