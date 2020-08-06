const path = require('path')

const core = require('@actions/core')
const exec = require('@actions/exec')

/**
 * This will set the pull request file path to process.env.GITHUB_EVENT_PATH.
 * GITHUB_EVENT_PATH is used in `@actions/github` package to get the pull request event data.
 * `@actions/github` is used in changelog-enforcer.js to get branch info.
 * @param {string} pullRequestFileName 
 */
function setGithubActionEvent(pullRequestFileName) {
  const eventPath = path.resolve(__dirname, pullRequestFileName)
  process.env.GITHUB_EVENT_PATH = eventPath
}

/**
 * Unset process.env.GITHUB_EVENT_PATH.
 */
function unsetGithubActionEvent() {
  delete process.env.GITHUB_EVENT_PATH;
}

/**
 * This group of test is from original changelog-enforcer repo:
 * https://github.com/dangoslen/changelog-enforcer/blob/50bc88b4d83b1bfffba40793a491e9f0823dd7af/__tests__/changelog-enforcer.test.js#L8-L97
 */
describe('for normal pull-request', () => {
  let changelogEnforcer
  let inputs = {}
  beforeAll(() => {
    setGithubActionEvent('pull_request.json')
    /**
     * jest.isolateModules enables us to repeatedly require modules without cache.
     * See: https://jestjs.io/docs/en/jest-object#jestisolatemodulesfn.
     * Because we'd like to test against pull request event in different base branch,
     * we'd need to require fresh changelog enforcer in different test.
     */
    jest.isolateModules(() => {
      changelogEnforcer = require('../src/changelog-enforcer')
    })
    jest.spyOn(core, 'getInput').mockImplementation((name) => {
      return inputs[name]
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    unsetGithubActionEvent()
    jest.restoreAllMocks();
  })

  it('should skip enforcing when label is present', async () => {
    // Mock getInput
    inputs['skipLabel'] = 'Skip-Changelog' 
    inputs['changeLogPath'] = 'CHANGELOG.md' 

    const infoSpy = jest.spyOn(core, 'info').mockImplementation(jest.fn())
    const failureSpy = jest.spyOn(core, 'error').mockImplementation(jest.fn())
    const execSpy = jest.spyOn(exec, 'exec').mockImplementation(() => { return 0 })

    await changelogEnforcer.enforce()

    expect(infoSpy.mock.calls.length).toBe(2)
    expect(execSpy).not.toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled()

  })

  it('should enforce when label is not present; changelog is not present', async () => {
    // Mock getInput
    inputs['skipLabel'] = 'A different label' 
    inputs['changeLogPath'] = 'CHANGELOG.md' 

    const infoSpy = jest.spyOn(core, 'info').mockImplementation(jest.fn())
    const failureSpy = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())
    const execSpy = jest.spyOn(exec, 'exec').mockImplementation((command, args, options) => {
      const stdout = 
`M       .env.js
A       an_added_changed_file.js`

      options.listeners.stdout(stdout)
      return 0
    })

    await changelogEnforcer.enforce()

    expect(infoSpy.mock.calls.length).toBe(2)
    expect(execSpy).toHaveBeenCalled()
    expect(failureSpy).toHaveBeenCalled()

    const command = execSpy.mock.calls[0][0]
    const commandArgs = execSpy.mock.calls[0][1].join(' ')
    expect(command).toBe('git')
    expect(commandArgs).toBe('diff origin/master --name-status --diff-filter=AM')

  })

  it('should enforce when label is not present; changelog is present', async () => {
    // Mock getInput
    inputs['skipLabel'] = 'A different label' 
    inputs['changeLogPath'] = 'CHANGELOG.md' 

    const infoSpy = jest.spyOn(core, 'info').mockImplementation(jest.fn())
    const failureSpy = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())
    const execSpy = jest.spyOn(exec, 'exec').mockImplementation((command, args, options) => {
      const stdout = 
`M       .env.js
M       CHANGELOG.md`

      options.listeners.stdout(stdout)
      return 0
    })

    await changelogEnforcer.enforce()

    expect(infoSpy.mock.calls.length).toBe(2)
    expect(execSpy).toHaveBeenCalled()
    expect(failureSpy).not.toHaveBeenCalled()

    const command = execSpy.mock.calls[0][0]
    const commandArgs = execSpy.mock.calls[0][1].join(' ')
    expect(command).toBe('git')
    expect(commandArgs).toBe('diff origin/master --name-status --diff-filter=AM')
  })
});

/**
 * Following is new test in our fork,
 * to make sure the changelog path is correct given different base branch.
 */
describe.each`
  baseBranch     | targetChangelogPath | mockEventFileName
  ${'develop'}        | ${'CHANGELOG.md'}        | ${'pull_request_base_on_develop.json'}
  ${'release/2.99.0'} | ${'changelogs/2.99.md'}  | ${'pull_request_base_on_release.json'}
  ${'hotfix/2.99.0'}  | ${'changelogs/2.99.md'}      | ${'pull_request_base_on_hotfix.json'}
`('for ichef pull-request on $baseBranch base branch', ({ targetChangelogPath, mockEventFileName }) => {
  let changelogEnforcer;
  beforeAll(() => {
    setGithubActionEvent(mockEventFileName)
    jest.isolateModules(() => {
      changelogEnforcer = require('../src/changelog-enforcer')
    })
  })

  afterAll(() => {
    unsetGithubActionEvent();
    jest.restoreAllMocks();
  })

  afterEach(() => {
    jest.clearAllMocks();
  })

  it(`should fail when ${targetChangelogPath} is not present`, async  () => {  
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    const failureSpy = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())
    jest.spyOn(exec, 'exec').mockImplementation((command, args, options) => {
      const stdout =  'M       changed_file.js'

      options.listeners.stdout(stdout)
      return 0
    })

    await changelogEnforcer.enforce()

    expect(failureSpy).toHaveBeenCalled()
  })

  it(`should success when ${targetChangelogPath} is in git diff`, async  () => {
    jest.spyOn(core, 'info').mockImplementation(jest.fn())
    const failureSpy = jest.spyOn(core, 'setFailed').mockImplementation(jest.fn())
    jest.spyOn(exec, 'exec').mockImplementation((command, args, options) => {
      const stdout =  `M       ${targetChangelogPath}`

      options.listeners.stdout(stdout)
      return 0
    })

    await changelogEnforcer.enforce()

    expect(failureSpy).not.toHaveBeenCalled()
  });
})
