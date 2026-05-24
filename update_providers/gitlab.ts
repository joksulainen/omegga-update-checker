import fetch from 'node-fetch';
import semver from 'semver';

import { PLUGIN_ANSI, ansiWrapper } from 'common';
import { defineProvider, PluginUpdateInfo } from 'update_provider';


export interface GLPluginUpdateInfo extends PluginUpdateInfo {
  api_type: 'gitlab',
  version: string,
  repo_info: {
    project_id: string,
  },
}

export default defineProvider<GLPluginUpdateInfo>({
  id: 'gitlab',
  
  isProviderType(uInfo: unknown): uInfo is GLPluginUpdateInfo {
    return (
      typeof uInfo === 'object' && uInfo !== null && 'api_type' in uInfo && typeof uInfo.api_type === 'string' && uInfo.api_type === this.id // abstract structure
      && 'version' in uInfo && typeof uInfo.version === 'string'
      && 'repo_info' in uInfo && typeof uInfo.repo_info === 'object' && uInfo.repo_info !== null
      && 'project_id' in uInfo.repo_info && typeof uInfo.repo_info.project_id === 'string' // provider specific
    );
  },
  
  isValidUpdateInfo(uInfo: GLPluginUpdateInfo): boolean {
    return this.isProviderType(uInfo) && semver.valid(uInfo.version) !== null;
  },
  
  async checkUpdate(name: string, uInfo: GLPluginUpdateInfo): Promise<string | null> {
    if (!this.isProviderType(uInfo)) {
      console.warn(`Update info for ${ansiWrapper(PLUGIN_ANSI, name)} is malformed`);
      throw new Error(`Update info for ${name} is malformed`);
    }
    if (!semver.valid(uInfo.version)) {
      console.warn(`Invalid local version for ${ansiWrapper(PLUGIN_ANSI, name)}: ${uInfo.version}`);
      throw new Error(`Invalid local version for ${name}: ${uInfo.version}`);
    }
    
    const response = await fetch(`https://gitlab.com/api/v4/projects/${uInfo.repo_info.project_id}/releases/`, {
      headers: { 'Content-Type': 'application/json' },
    }).catch((e) => {
      console.error(`Network error checking ${ansiWrapper(PLUGIN_ANSI, name)}:`, e);
      throw e;
    });
    
    // stop if there is no response
    if (!response || !response.ok) {
      console.warn(`Failed to fetch release data for ${ansiWrapper(PLUGIN_ANSI, name)}`);
      throw new Error(`Failed to fetch release data for ${name}: ${response?.status} ${response?.statusText}`);
    }
    const data = await response.json();
    
    let remoteVersion: string | null = null;
    for (const release of data) {
      // we shouldnt use an upcoming release
      if (release.upcoming_release) continue;
      
      // see if the tag name contains a stable semver and grab it
      remoteVersion = semver.clean(release.tag_name);
      break;
    }
    if (!remoteVersion) {
      console.warn(`Invalid remote version tag for ${ansiWrapper(PLUGIN_ANSI, name)}: ${data.tag_name}`);
      throw new Error(`Invalid remote version tag for ${name}: ${data.tag_name}`);
    }
    
    return semver.gt(remoteVersion, uInfo.version) ? remoteVersion : null;
  },
});
