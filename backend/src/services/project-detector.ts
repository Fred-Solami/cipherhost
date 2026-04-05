import fs from 'fs';
import path from 'path';
import { ProjectType } from '../models/types';
import { logger } from '../utils/logger';

export class ProjectDetector {
  detectProjectType(workDir: string): ProjectType {
    try {
      if (fs.existsSync(path.join(workDir, 'package.json'))) {
        logger.debug(`Detected Node.js project in ${workDir}`);
        return 'NODEJS';
      }

      if (
        fs.existsSync(path.join(workDir, 'requirements.txt')) ||
        fs.existsSync(path.join(workDir, 'pyproject.toml'))
      ) {
        logger.debug(`Detected Python project in ${workDir}`);
        return 'PYTHON';
      }

      const files = fs.readdirSync(workDir);
      const csprojFile = files.find((file) => file.endsWith('.csproj'));
      if (csprojFile) {
        logger.debug(`Detected .NET project in ${workDir}`);
        return 'DOTNET';
      }

      // PHP detection: composer.json or index.php
      if (
        fs.existsSync(path.join(workDir, 'composer.json')) ||
        fs.existsSync(path.join(workDir, 'index.php')) ||
        fs.existsSync(path.join(workDir, 'public', 'index.php'))
      ) {
        logger.debug(`Detected PHP project in ${workDir}`);
        return 'PHP';
      }

      logger.warn(`Unable to detect project type in ${workDir}`);
      return 'UNKNOWN';
    } catch (error) {
      logger.error(`Error detecting project type: ${error}`);
      return 'UNKNOWN';
    }
  }

  validateNodeJsProject(workDir: string): { valid: boolean; error?: string } {
    const packageJsonPath = path.join(workDir, 'package.json');
    const packageLockPath = path.join(workDir, 'package-lock.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { valid: false, error: 'package.json not found' };
    }

    if (!fs.existsSync(packageLockPath)) {
      return {
        valid: false,
        error: 'package-lock.json required for security. Run npm install locally and commit the lock file.',
      };
    }

    return { valid: true };
  }

  validatePythonProject(workDir: string): { valid: boolean; error?: string } {
    const requirementsPath = path.join(workDir, 'requirements.txt');
    const pyprojectPath = path.join(workDir, 'pyproject.toml');

    if (!fs.existsSync(requirementsPath) && !fs.existsSync(pyprojectPath)) {
      return { valid: false, error: 'requirements.txt or pyproject.toml not found' };
    }

    return { valid: true };
  }

  validatePhpProject(workDir: string): { valid: boolean; error?: string } {
    const hasComposer = fs.existsSync(path.join(workDir, 'composer.json'));
    const hasIndex = fs.existsSync(path.join(workDir, 'index.php'));
    const hasPublicIndex = fs.existsSync(path.join(workDir, 'public', 'index.php'));

    if (!hasComposer && !hasIndex && !hasPublicIndex) {
      return { valid: false, error: 'No PHP entry point found (composer.json, index.php, or public/index.php)' };
    }

    return { valid: true };
  }
}
