# update-checker

A utility [omegga](https://github.com/brickadia-community/omegga) plugin for plugins to hook into and easily add update notifications.

## Install & update

```bash
# install
omegga install gh:joksulainen/update-checker

# update
omegga update update-checker
```

## Config

All config options configurable in omeggas web UI.

| Config              | Type           | Default | Description |
| ------------------- | -------------- | ------- | ----------- |
| `notify_in_chat`    | `boolean`      | `true`  | Whether or not to post update notifications into the in-game chat. |
| `check_interval`    | `number`       | `120`   | The interval in minutes at which the plugin will check for updates. |
| `first_check_delay` | `number`       | `5`     | The delay in seconds at which the plugin will check for updates on init. |
| `ignored_plugins`   | `list[string]` | `[]`    | A list of plugins that this plugin will not check updates for. |

## Usage

Updates are based on releases and their tag names in the plugin repository.

Example implementation below and in my [this plugin](https://github.com/joksulainen/omegga-rolelogger).

```typescript
const updateInfo = {
    version: '1.2.3',                   // a semantic version
    api_type: 'github',                 // 'github' or 'gitlab'
    repo_info: {
        owner: 'joksulainen',           // used only if api type is github
        repo: 'omegga-update-checker',  // used only if api type is github
        project_id: '12345',            // used only if api type is gitlab
    },
};

async init() {
    // other code
    
    // if this plugin is loaded after the update-checker plugin then there should
    // be additional logic to check for its existence
    const ucPlugin = this.omegga.getPlugin('update-checker');
    if (ucPlugin) {
        ucPlugin.emitPlugin('hook', [updateInfo]);
    }
    
    // listen to this event to know when the plugin is ready
    // what event? its not possible (sadly)
}

// please clean up your hooks so the plugin doesnt have to when it performs the checks
async stop() {
    // other code
    
    // get the plugin and emit unhook
    const ucPlugin = await this.omegga.getPlugin('update-checker');
    ucPlugin.emitPlugin('unhook', []);
}
```
