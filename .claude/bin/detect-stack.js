'use strict';
/**
 * detect-stack.js — Infiere el stack tecnologico del proyecto anfitrion.
 * Solo verifica existencia de archivos manifesto — no los lee, no gasta tokens.
 * Retorna { techs, permissions, claudeMdSections }.
 */

const fs   = require('fs');
const path = require('path');

const MANIFESTS = [
  { file: 'package.json',       tech: 'node' },
  { file: 'pyproject.toml',     tech: 'python' },
  { file: 'requirements.txt',   tech: 'python' },
  { file: 'setup.py',           tech: 'python' },
  { file: 'go.mod',             tech: 'go' },
  { file: 'Cargo.toml',         tech: 'rust' },
  { file: 'pom.xml',            tech: 'java' },
  { file: 'build.gradle',       tech: 'java' },
  { file: 'composer.json',      tech: 'php' },
  { file: 'Gemfile',            tech: 'ruby' },
  { file: 'Dockerfile',         tech: 'docker' },
  { file: 'docker-compose.yml', tech: 'docker' },
  { file: 'docker-compose.yaml',tech: 'docker' },
  { file: 'Makefile',           tech: 'make' },
  { file: '.terraform',         tech: 'terraform' },
  { file: 'serverless.yml',     tech: 'serverless' },
  { file: 'serverless.yaml',    tech: 'serverless' },
  { file: 'turbo.json',         tech: 'monorepo' },
  { file: 'nx.json',            tech: 'monorepo' },
  { file: 'pnpm-workspace.yaml',tech: 'monorepo' },
];

// Directorios que indican sub-stacks o patrones especificos
const DIR_HINTS = [
  { dir: 'migrations',          tech: 'db-migrations' },
  { dir: 'alembic',             tech: 'db-migrations' },
  { dir: '__tests__',           tech: 'jest' },
  { dir: 'tests',               tech: 'testing' },
  { dir: 'test',                tech: 'testing' },
  { dir: 'spec',                tech: 'testing' },
  { dir: 'src',                 tech: 'src-layout' },
  { dir: 'app',                 tech: 'app-layout' },
  { dir: 'api',                 tech: 'api-layout' },
  { dir: '.github/workflows',   tech: 'github-actions' },
  { dir: 'k8s',                 tech: 'kubernetes' },
  { dir: 'helm',                tech: 'kubernetes' },
  { dir: 'infrastructure',      tech: 'iac' },
  { dir: 'infra',               tech: 'iac' },
];

// Permisos de Bash por tecnologia detectada
const TECH_PERMISSIONS = {
  node:         ['Bash(npx*)', 'Bash(yarn*)'],
  python:       ['Bash(python*)', 'Bash(python3*)', 'Bash(pip*)', 'Bash(pip3*)', 'Bash(pytest*)', 'Bash(uvicorn*)', 'Bash(uv*)'],
  go:           ['Bash(go*)'],
  rust:         ['Bash(cargo*)'],
  java:         ['Bash(mvn*)', 'Bash(gradle*)', 'Bash(java*)'],
  php:          ['Bash(composer*)', 'Bash(php*)'],
  ruby:         ['Bash(bundle*)', 'Bash(rails*)', 'Bash(ruby*)'],
  docker:       ['Bash(docker*)', 'Bash(docker-compose*)'],
  make:         ['Bash(make*)'],
  terraform:    ['Bash(terraform*)'],
  serverless:   ['Bash(serverless*)', 'Bash(sls*)'],
  'github-actions': [],
  kubernetes:   ['Bash(kubectl*)', 'Bash(helm*)'],
  iac:          [],
  jest:         [],
  testing:      [],
  'src-layout': [],
  'app-layout': [],
  'api-layout': [],
  'db-migrations': ['Bash(knex*)', 'Bash(alembic*)'],
  monorepo:     ['Bash(turbo*)', 'Bash(nx*)', 'Bash(pnpm*)'],
};

// Descripcion legible por tech para el CLAUDE.md
const TECH_LABELS = {
  node:          'Node.js / npm',
  python:        'Python',
  go:            'Go',
  rust:          'Rust / Cargo',
  java:          'Java (Maven/Gradle)',
  php:           'PHP / Composer',
  ruby:          'Ruby / Rails',
  docker:        'Docker',
  make:          'Makefile',
  terraform:     'Terraform',
  serverless:    'Serverless Framework',
  monorepo:      'Monorepo (Turbo/Nx/pnpm)',
  'db-migrations': 'Database Migrations',
  'github-actions': 'GitHub Actions CI',
  kubernetes:    'Kubernetes / Helm',
  iac:           'Infrastructure as Code',
};

/**
 * @param {string} projectDir - ruta absoluta al directorio del proyecto anfitrion
 * @returns {{ techs: string[], permissions: string[], labels: string[] }}
 */
function detectStack(projectDir) {
  const techs = new Set();

  for (const { file, tech } of MANIFESTS) {
    if (fs.existsSync(path.join(projectDir, file))) techs.add(tech);
  }

  for (const { dir, tech } of DIR_HINTS) {
    if (fs.existsSync(path.join(projectDir, dir))) techs.add(tech);
  }

  const techList = [...techs];
  const permissions = [...new Set(techList.flatMap(t => TECH_PERMISSIONS[t] ?? []))];
  const labels = techList.map(t => TECH_LABELS[t]).filter(Boolean);

  return { techs: techList, permissions, labels };
}

module.exports = { detectStack };
