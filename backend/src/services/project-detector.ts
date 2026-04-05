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
}
