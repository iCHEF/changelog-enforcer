const path = require('path')

const core = require('@actions/core')
const exec = require('@actions/exec')

function setGithubActionEvent(pullRequestFileName) {
  const eventPath = path.resolve(__dirname, pullRequestFileName)
  process.env.GITHUB_EVENT_PATH = eventPath
}
function unsetGithubActionEvent() {
  delete process.env.GITHUB_EVENT_PATH;
}

describe('for normal pull-request', () => {
  let changelogEnforcer
  let inputs = {}
  beforeAll(() => {
    setGithubActionEvent('pull_request.json')
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
