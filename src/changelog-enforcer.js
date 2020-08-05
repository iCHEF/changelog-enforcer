const core = require('@actions/core')
const github = require('@actions/github')
const exec = require('@actions/exec')

/**
 * Get changelog path with ichef git flow:
 * - if it's `release/x.y.z` or `hotfix/x.y.z` -> changelog should be `changelogs/x.y.md`
 * - otherwise -> changelog should be 'CHANGELOG.md'
 */
function getIchefChangeLogPath() {
    const pullRequest = github.context.payload.pull_request
    const baseRef = pullRequest.base.ref
    const baseRefIsReleaseBranch = baseRef.startsWith('release/');
    const baseRefIsHotfixBranch = baseRef.startsWith('hotfix/');
    if (baseRefIsReleaseBranch || baseRefIsHotfixBranch) {
        const fullReleaseVersion = baseRef.split('/')[1];
        const releaseVersionUpToMinor = fullReleaseVersion.split('.').slice(0, 2).join('.');
        return `changelogs/${releaseVersionUpToMinor}.md`;
    }
    return 'CHANGELOG.md';
}

module.exports.enforce = async function() {
    try {
        const skipLabel = core.getInput('skipLabel')
        let changeLogPath = core.getInput('changeLogPath') || getIchefChangeLogPath();
        core.info(`Skip Label: ${skipLabel}`)
        core.info(`Changelog Path: ${changeLogPath}`)

        const pullRequest = github.context.payload.pull_request
        const labelNames = pullRequest.labels.map(l => l.name)
        const baseRef = pullRequest.base.ref

        if (!labelNames.includes(skipLabel)) {
            let output = ''
            const options = {}
            options.listeners = {
                stdout: (data) => {
                    output += data.toString();
                }
            }
        
            await exec.exec('git', ['diff', `origin/${baseRef}`, '--name-status', '--diff-filter=AM'], options)

            const fileNames = generateUpdatedFileList(output)   
            if (!fileNames.includes(changeLogPath)) {
                throw new Error(`No update to ${changeLogPath} found!`)
            }
        }
    } catch(error) {
        core.setFailed(error.message);
    }
};

function generateUpdatedFileList(output) {
    const changes = output.split(/\r?\n/)
    let fileNames = []
    changes.map(change => {
        const fileName = change.replace(/(^[A-Z])(\s*)(.*)(\n)?$/g, '$3')
        fileNames.push(fileName)
    })
    return fileNames;
}
