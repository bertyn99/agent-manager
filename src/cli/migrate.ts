#!/usr/bin/env node
/**
 * Migration utility to import skills from skill-manager to agent-manager
 * 
 * This script:
 * 1. Reads ~/.config/opencode/skills.yaml
 * 2. Imports configured repositories
 * 3. Copies existing skills
 * 4. Creates unified manifest
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copySync, removeSync } from 'fs-extra';
import { join, basename } from 'path';
import { simpleGit } from 'simple-git';
import { loadConfig, saveConfig, getDefaultConfig } from '../core/config.js';
import { SkillsManifestSchema, ManifestSourceSchema } from '../core/validators.js';

const OLD_SKILLS_YAML = `${process.env.HOME}/.config/opencode/skills.yaml`;
const OLD_SKILLS_DIR = `${process.env.HOME}/.config/opencode/skill`;
const OLD_VENDOR_DIR = `${process.env.HOME}/vendor-skill`;
const NEW_CONFIG_DIR = `${process.env.HOME}/.config/agent-manager`;
const NEW_SKILLS_DIR = `${NEW_CONFIG_DIR}/skill`;
const NEW_VENDOR_DIR = `${NEW_CONFIG_DIR}/vendor`;

async function migrate() {
  console.log('🔄 Starting migration from skill-manager to agent-manager...\n');
  
  // Check if old installation exists
  if (!existsSync(OLD_SKILLS_YAML)) {
    console.log('❌ No skill-manager installation found.');
    console.log('   No ~/.config/opencode/skills.yaml exists.');
    return;
  }
  
  console.log('✓ Found skill-manager configuration');
  
  // Create new directories
  mkdirSync(NEW_CONFIG_DIR, { recursive: true });
  mkdirSync(NEW_SKILLS_DIR, { recursive: true });
  mkdirSync(NEW_VENDOR_DIR, { recursive: true });
  
  // Read old manifest
  const oldManifestContent = readFileSync(OLD_SKILLS_YAML, 'utf-8');
  const oldManifest = JSON.parse(oldManifestContent);
  
  // Validate and parse
  const sources = oldManifest.sources || [];
  const customized = oldManifest.customized || [];
  const disabled = oldManifest.disabled || [];
  
  console.log(`📦 Found ${sources.length} configured repositories`);
  console.log(`📝 Found ${customized.length} customized skills`);
  console.log(`🚫 Found ${disabled.length} disabled skills\n`);
  
  // Clone repositories
  console.log('📥 Cloning repositories...\n');
  const newSources = [];
  
  for (const source of sources) {
    const repoUrl = source.repo;
    const repoName = extractRepoName(repoUrl);
    const targetDir = join(NEW_VENDOR_DIR, repoName);
    
    console.log(`  Cloning ${repoUrl}...`);
    
    try {
      if (existsSync(targetDir)) {
        console.log(`    → Already exists, updating...`);
        const git = simpleGit(targetDir);
        await git.pull();
      } else {
        await simpleGit().clone(repoUrl, targetDir);
      }
      
      // Pin to specific commit/tag if specified
      if (source.pinned) {
        const git = simpleGit(targetDir);
        await git.checkout(source.pinned);
        console.log(`    → Pinned to ${source.pinned}`);
      }
      
      // Add to new manifest
      newSources.push({
        repo: source.repo,
        path: source.path || 'skills',
        nested: source.nested || false,
        branch: source.branch || 'main',
        pinned: source.pinned || null,
        include: source.include || ['*'],
        exclude: source.exclude || [],
      });
      
      console.log(`    → Done\n`);
    } catch (error) {
      console.log(`    → Failed: ${error}\n`);
    }
  }
  
  // Copy existing skills
  console.log('📋 Copying existing skills...\n');
  
  if (existsSync(OLD_SKILLS_DIR)) {
    for (const item of readdirSync(OLD_SKILLS_DIR)) {
      const oldPath = join(OLD_SKILLS_DIR, item);
      const newPath = join(NEW_SKILLS_DIR, item);
      
      if (existsSync(newPath)) {
        console.log(`  ⚠️  ${item} already exists, skipping`);
        continue;
      }
      
      if (existsSync(oldPath)) {
        console.log(`  → Copying ${item}`);
        copySync(oldPath, newPath);
      }
    }
  }
  
  // Create new manifest
  const newManifest = {
    sources: newSources,
    customized: customized,
    local: [],
    disabled: disabled,
    upgraded: [],
  };
  
  const newManifestPath = join(NEW_CONFIG_DIR, 'skills.yaml');
  writeFileSync(newManifestPath, JSON.stringify(newManifest, null, 2));
  
  // Save agent-manager config
  const config = getDefaultConfig();
  config.manifestPath = newManifestPath;
  config.skillsPath = NEW_SKILLS_DIR;
  config.vendorPath = NEW_VENDOR_DIR;
  
  const configPath = join(NEW_CONFIG_DIR, 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // Summary
  console.log('✅ Migration complete!\n');
  console.log('Summary:');
  console.log(`  • Repositories: ${newSources.length}`);
  console.log(`  • Skills copied: ${customized.length}`);
  console.log(`  • Disabled: ${disabled.length}`);
  console.log(`  • New config: ${newManifestPath}`);
  console.log(`  • New skills: ${NEW_SKILLS_DIR}`);
  console.log(`  • New vendor: ${NEW_VENDOR_DIR}\n`);
  
  console.log('Next steps:');
  console.log('  1. Run "npm install" in agent-manager directory');
  console.log('  2. Run "npm run build" to compile TypeScript');
  console.log('  3. Symlink agent-manager to your PATH');
  console.log('  4. Run "agent-manager sync" to create symlinks\n');
}

// Helper function to extract repo name from URL
function extractRepoName(repoUrl: string): string {
  // Handle various URL formats
  let name = repoUrl
    .replace(/^https?:\/\//, '')
    .replace(/^git@/, '')
    .replace(/^github:/, '')
    .replace(/\.git$/, '');
  
  return name.replace(/\//g, '-');
}

// Run migration
migrate().catch(console.error);
