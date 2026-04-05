import simpleGit, { SimpleGit } from 'simple-git';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

export class GitService {
  private git: SimpleGit;

  constructor() {
    this.git = simpleGit();
  }

  async cloneRepository(
    repoUrl: string,
    branch: string,
    targetDir: string
  ): Promise<void> {
    try {
      logger.info(`Cloning repository ${repoUrl} (branch: ${branch}) to ${targetDir}`);

      if (fs.existsSync(targetDir)) {
        logger.debug(`Target directory exists, removing: ${targetDir}`);
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      const parentDir = path.dirname(targetDir);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      await this.git.clone(repoUrl, targetDir, ['--branch', branch, '--single-branch', '--depth', '1']);

      logger.info(`Repository cloned successfully to ${targetDir}`);
    } catch (error) {
      logger.error(`Git clone failed: ${error}`);
      throw new Error(`Git clone failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async pullLatest(workDir: string, branch: string): Promise<void> {
    try {
      logger.info(`Pulling latest changes for ${workDir} (branch: ${branch})`);

      const git = simpleGit(workDir);
      await git.fetch();
      await git.checkout(branch);
      await git.pull('origin', branch);

      logger.info(`Repository updated successfully`);
    } catch (error) {
      logger.error(`Git pull failed: ${error}`);
      throw new Error(`Git pull failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getCurrentCommit(workDir: string): Promise<string> {
    try {
      const git = simpleGit(workDir);
      const log = await git.log({ maxCount: 1 });
      return log.latest?.hash || 'unknown';
    } catch (error) {
      logger.error(`Failed to get current commit: ${error}`);
      return 'unknown';
    }
  }

  validateGitUrl(url: string): boolean {
    const httpsPattern = /^https:\/\/[\w.-]+\/[\w.\/-]+$/;
    const sshPattern = /^git@[\w.-]+:[\w.\/-]+$/;
    
    return httpsPattern.test(url) || sshPattern.test(url);
  }
}
