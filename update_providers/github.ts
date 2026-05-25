import fetch from 'node-fetch';
import semver from 'semver';

import { PLUGIN_ANSI, ansiWrapper } from '@/common';
import { defineProvider, PluginUpdateInfo, PluginUpdate } from '@/update_provider';


export interface GHPluginUpdateInfo extends PluginUpdateInfo {
  api_type: 'github',
  version: string,
  repo_info: {
    owner: string,
    repo: string,
  },
}

export default defineProvider<GHPluginUpdateInfo>({
  id: 'github',
  
  isProviderType(uInfo: unknown): uInfo is GHPluginUpdateInfo {
    return (
      typeof uInfo === 'object' && uInfo !== null && 'api_type' in uInfo && typeof uInfo.api_type === 'string' && uInfo.api_type === this.id // abstract structure
      && 'version' in uInfo && typeof uInfo.version === 'string'
      && 'repo_info' in uInfo && typeof uInfo.repo_info === 'object' && uInfo.repo_info !== null
      && 'owner' in uInfo.repo_info && typeof uInfo.repo_info.owner === 'string'
      && 'repo' in uInfo.repo_info && typeof uInfo.repo_info.repo === 'string' // provider specific
    );
  },
  
  isValidUpdateInfo(uInfo: GHPluginUpdateInfo): boolean {
    return this.isProviderType(uInfo) && semver.valid(uInfo.version) !== null;
  },
  
  async checkUpdate(name: string, uInfo: GHPluginUpdateInfo): Promise<PluginUpdate | null> {
    const response = await fetch(`https://api.github.com/repos/${uInfo.repo_info.owner}/${uInfo.repo_info.repo}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10' },
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
    
    const remoteVersion = semver.clean(data.tag_name);
    if (!remoteVersion) {
      console.warn(`Invalid remote version tag for ${ansiWrapper(PLUGIN_ANSI, name)}: ${data.tag_name}`);
      throw new Error(`Invalid remote version tag for ${name}: ${data.tag_name}`);
    }
    
    return semver.gt(remoteVersion, uInfo.version) ? { local_ver: uInfo.version, remote_ver: remoteVersion } : null;
  },
});
