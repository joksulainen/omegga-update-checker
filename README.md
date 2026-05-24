# update-checker

A utility [omegga](https://github.com/brickadia-community/omegga) plugin for plugins to easily add update notifications.

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
| `notify_in_chat`    | `boolean`      | `true`  | Whether or not to post update notifications into the in-game chat. This is a short blurb if at least one plugin has an update. |
| `check_interval`    | `number`       | `120`   | The interval in minutes at which the plugin will check for updates. |
| `first_check_delay` | `number`       | `5`     | The delay in seconds after which the plugin will check for updates on init. |
| `ignored_plugins`   | `list[string]` | `[]`    | A list of plugins that this plugin will not check updates for. |

## Usage

Updates are based on releases and their tag names in the plugin repository or, in the case of the git api type, commits on the main branch.

Simply add a `uc-info.json` file into your plugin directory and provide the following information.

```jsonc
{
    "api_type": "github",                 // 'github' or 'gitlab' or 'git' or any third party provider id
    "version": "1.2.3",                   // a semantic version, used only if api type is github or gitlab
    "repo_info": {                        // exists only if api type is not git. required contents depend on provider
        "owner": "joksulainen",           // used only if api type is github
        "repo": "omegga-update-checker",  // used only if api type is github
        "project_id": "12345",            // used only if api type is gitlab
    }
}
```

This plugin will read this json file to check the repository for any updates.

This plugin is not dependent on any single api and you can write your own provider so long as you conform to the interface spec. Use any existing provider as a template.

Update providers are found in the `update_providers` directory of which git, github, and gitlab are maintained by me.

Git because its universal but less granular, the others because omegga supports them.
