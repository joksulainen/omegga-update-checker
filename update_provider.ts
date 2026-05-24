export interface PluginUpdateInfo {
  api_type: string,
}

export interface PluginUpdate {
  local_ver: string,
  remote_ver: string,
}

export interface UpdateProvider<T extends PluginUpdateInfo = PluginUpdateInfo> {
  readonly id: string,
  isProviderType(uInfo: unknown): uInfo is T,
  isValidUpdateInfo(_uInfo: PluginUpdateInfo): boolean,
  checkUpdate(_name: string, _uInfo: PluginUpdateInfo): Promise<PluginUpdate | null>,
}

export function defineProvider<T extends PluginUpdateInfo>(
  provider: UpdateProvider<T>,
): UpdateProvider<T> {
  return provider;
}
