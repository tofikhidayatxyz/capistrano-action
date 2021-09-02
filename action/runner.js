'use strict'

const core = require('@actions/core')
const io = require('@actions/io')
const toolrunner = require('@actions/exec/lib/toolrunner')
const fs = require('fs')
const path = require('path')

const authSock = '/tmp/ssh-auth.sock'

async function exportRSAKey(deployKey, options) {
  const configDir = options.cwd ? `${options.cwd}/config` : 'config'
  await io.mkdirP(configDir)

  await fs.writeFileSync(path.join(configDir, 'deploy_id_rsa'), deployKey)

  const runner1 = new toolrunner.ToolRunner('chmod', ['0600', 'config/deploy_id_rsa'], options)
  await runner1.exec()

  const runner2 = new toolrunner.ToolRunner('ssh-agent', ['-a', authSock])
  await runner2.exec()

  core.exportVariable('SSH_AUTH_SOCK', authSock)
  const runner3 = new toolrunner.ToolRunner('ssh-add', ['config/deploy_id_rsa'], options)
  await runner3.exec()
}

async function deploy(target, capistranoCommands, options) {
  let args = []
  if (!target) {
    args = ['exec', 'cap'].concat(capistranoCommands)
  } else {
    args = ['exec', 'cap', target].concat(capistranoCommands)
  }
  const runner = new toolrunner.ToolRunner('bundle', args, options)
  await runner.exec()
}

async function removeAuthSock() {
  await io.rmRF(authSock)
}

function run() {
  return new Promise(async (resolve, reject) => {
    const commands = JSON.parse(core.getInput('capistrano_commands'))
    const target = core.getInput('target')
    const deployKey = core.getInput('rsa_key')
    const workingDirectory = core.getInput('working_directory')
    const selfHosted = core.getInput('selft_hosted')

    console.log(`DEPLOY KEY ${deployKey}`)

    try {
      const options = workingDirectory ? { cwd: workingDirectory } : {}
      if (!deployKey) {
        const args = 'No deploy RSA key given'
        core.setFailed(args)
        reject(args)
      }

      await exportRSAKey(deployKey, options)
      await deploy(target, commands, options)
    } catch (e) {
      core.setFailed(e)
    }

    // runner
    if (selfHosted) {
      await removeAuthSock()
    }
  })
}

run().catch(core.setFailed)
