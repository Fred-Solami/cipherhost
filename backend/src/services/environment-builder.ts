import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { ProjectType, BuildResult } from '../models/types';
import { logger } from '../utils/logger';
import { config } from '../config';

const execAsync = promisify(exec);

export class EnvironmentBuilder {
  private buildLog: string[] = [];

  async buildEnvironment(workDir: string, projectType: ProjectType, customBuildCommand?: string): Promise<BuildResult> {
    logger.info(`Building environment for ${projectType} project in ${workDir}`);
    this.buildLog = [];

    try {
      let result: BuildResult;

      if (projectType === 'PYTHON') {
        result = await this.buildPythonEnvironment(workDir);
      } else if (projectType === 'NODEJS') {
        result = await this.buildNodeJsEnvironment(workDir);
      } else if (projectType === 'DOTNET') {
        result = await this.buildDotNetEnvironment(workDir);
      } else if (projectType === 'PHP') {
        result = await this.buildPhpEnvironment(workDir);
      } else {
        return {
          success: false,
          message: 'Unknown project type',
          error: 'Unable to build environment for unknown project type',
          buildLog: '',
        };
      }

      // Run custom build command if provided (after standard build)
      if (result.success && customBuildCommand) {
        this.log(`Running custom build command: ${customBuildCommand}`);
        const customResult = await this.runCommand(customBuildCommand, workDir);
        if (!customResult.success) {
          return {
            success: false,
            message: 'Custom build command failed',
            error: customResult.error,
            buildLog: this.buildLog.join('\n'),
          };
        }
      }

      result.buildLog = this.buildLog.join('\n');
      return result;
    } catch (error) {
      logger.error(`Environment build failed: ${error}`);
      this.log(`FATAL: ${error}`);
      return {
        success: false,
        message: 'Build failed',
        error: error instanceof Error ? error.message : String(error),
        buildLog: this.buildLog.join('\n'),
      };
    }
  }

  private log(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`;
    this.buildLog.push(line);
    logger.debug(line);
  }

  private async runCommand(command: string, cwd: string): Promise<{ success: boolean; stdout: string; error?: string }> {
    this.log(`$ ${command}`);
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: config.deployment.buildTimeout,
      });
      if (stdout) this.log(stdout.trim());
      if (stderr) this.log(`[stderr] ${stderr.trim()}`);
      return { success: true, stdout: stdout || '' };
    } catch (error: any) {
      const msg = error.stderr || error.message || String(error);
      this.log(`ERROR: ${msg}`);
      return { success: false, stdout: '', error: msg };
    }
  }

  private async buildPythonEnvironment(workDir: string): Promise<BuildResult> {
    const venvPath = path.join(workDir, 'venv');

    try {
      this.log('Creating Python virtual environment...');
      const venvResult = await this.runCommand(`python -m venv "${venvPath}"`, workDir);
      if (!venvResult.success) throw new Error(venvResult.error);

      const pipPath = path.join(venvPath, 'Scripts', 'pip.exe');
      const requirementsPath = path.join(workDir, 'requirements.txt');

      if (fs.existsSync(requirementsPath)) {
        this.log('Installing Python dependencies from requirements.txt...');
        const pipResult = await this.runCommand(`"${pipPath}" install -r requirements.txt`, workDir);
        if (!pipResult.success) throw new Error(pipResult.error);
      }

      if (!fs.existsSync(venvPath)) {
        throw new Error('Virtual environment creation failed');
      }

      this.log('Python environment created successfully');
      return { success: true, message: 'Python environment created' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Python build failed: ${msg}`);
      return { success: false, message: 'Python build failed', error: msg };
    }
  }

  private async buildNodeJsEnvironment(workDir: string): Promise<BuildResult> {
    const packageJsonPath = path.join(workDir, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { success: false, message: 'package.json not found', error: 'package.json not found in project directory' };
    }

    try {
      const installFlags = config.npm.disableScripts ? '--ignore-scripts' : '';
      const installCommand = config.npm.requirePackageLock ? 'ci' : 'install';

      this.log(`Running npm ${installCommand} ${installFlags}...`);
      const installResult = await this.runCommand(`npm ${installCommand} ${installFlags}`, workDir);
      if (!installResult.success) throw new Error(installResult.error);

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.scripts?.build) {
        this.log('Running npm build script...');
        const buildResult = await this.runCommand('npm run build', workDir);
        if (!buildResult.success) throw new Error(buildResult.error);
      }

      const nodeModulesPath = path.join(workDir, 'node_modules');
      if (!fs.existsSync(nodeModulesPath)) {
        throw new Error('node_modules directory not created');
      }

      this.log('Node.js environment created successfully');
      return { success: true, message: 'Node.js environment created' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`Node.js build failed: ${msg}`);
      return { success: false, message: 'Node.js build failed', error: msg };
    }
  }

  private async buildDotNetEnvironment(workDir: string): Promise<BuildResult> {
    try {
      this.log('Running dotnet restore...');
      const restoreResult = await this.runCommand('dotnet restore', workDir);
      if (!restoreResult.success) throw new Error(restoreResult.error);

      this.log('Running dotnet build...');
      const buildResult = await this.runCommand('dotnet build --configuration Release', workDir);
      if (!buildResult.success) throw new Error(buildResult.error);

      this.log('.NET environment built successfully');
      return { success: true, message: '.NET environment built' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`.NET build failed: ${msg}`);
      return { success: false, message: '.NET build failed', error: msg };
    }
  }

  private async buildPhpEnvironment(workDir: string): Promise<BuildResult> {
    const composerJson = path.join(workDir, 'composer.json');

    try {
      if (fs.existsSync(composerJson)) {
        this.log('Running composer install...');
        const installResult = await this.runCommand('composer install --no-interaction --no-dev --optimize-autoloader', workDir);
        if (!installResult.success) {
          // Composer may not be in PATH — try common Windows location
          this.log('Retrying with full composer path...');
          const retryResult = await this.runCommand(
            'php composer.phar install --no-interaction --no-dev --optimize-autoloader',
            workDir
          );
          if (!retryResult.success) throw new Error(retryResult.error);
        }
      } else {
        this.log('No composer.json found, skipping dependency install');
      }

      // Check for a public/ directory (Laravel, Symfony)
      const publicDir = path.join(workDir, 'public');
      if (fs.existsSync(publicDir)) {
        this.log('Detected public/ directory (framework project)');
      }

      // Check for artisan (Laravel) and run any pending setup
      const artisan = path.join(workDir, 'artisan');
      if (fs.existsSync(artisan)) {
        this.log('Laravel project detected');

        // Generate .env if .env.example exists and .env doesn't
        const envExample = path.join(workDir, '.env.example');
        const envFile = path.join(workDir, '.env');
        if (fs.existsSync(envExample) && !fs.existsSync(envFile)) {
          fs.copyFileSync(envExample, envFile);
          this.log('Copied .env.example to .env');

          const keyResult = await this.runCommand('php artisan key:generate --force', workDir);
          if (keyResult.success) {
            this.log('Generated Laravel application key');
          }
        }
      }

      this.log('PHP environment created successfully');
      return { success: true, message: 'PHP environment created' };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.log(`PHP build failed: ${msg}`);
      return { success: false, message: 'PHP build failed', error: msg };
    }
  }
}
