#!/usr/bin/env node

/**
 * Wiki 기계 검증 스크립트
 * 1) Frontmatter 검증
 * 2) 스키마 구조 검증
 * 3) 파일명 규칙 검증
 */

const fs = require('fs');
const path = require('path');

const WIKI_DIR = path.join(__dirname, 'wiki');
const RAW_DIR = path.join(__dirname, 'raw');

// 색상 정의
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
};

interface ValidationResult {
  fileName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

const results: ValidationResult[] = [];

/**
 * 1. 파일명 규칙 검증 (YYYY-MM-DD-*.md)
 */
function validateFileName(fileName: string): [boolean, string[]] {
  const errors: string[] = [];
  const pattern = /^\d{4}-\d{2}-\d{2}-.+\.md$/;

  if (!pattern.test(fileName)) {
    errors.push(`파일명 규칙 위반: YYYY-MM-DD-*.md 형식이어야 함`);
  }

  return [errors.length === 0, errors];
}

/**
 * 2. Frontmatter 검증
 */
function validateFrontmatter(content: string): [boolean, string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Frontmatter 추출
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    errors.push(`Frontmatter이 없습니다`);
    return [false, errors, warnings];
  }

  const frontmatter = frontmatterMatch[1];
  const lines = frontmatter.split('\n');
  const fm: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) {
      fm[match[1].trim()] = match[2].trim();
    }
  }

  // 필수 필드 검증
  const requiredFields = ['원본', '회의일', '회의체', '참석'];
  for (const field of requiredFields) {
    if (!fm[field]) {
      errors.push(`필수 필드 누락: ${field}`);
    }
  }

  // 회의일 형식 검증
  if (fm['회의일'] && !/^\d{4}-\d{2}-\d{2}$/.test(fm['회의일'])) {
    errors.push(`회의일 형식 오류: YYYY-MM-DD 형식이어야 함`);
  }

  // 선택 필드 확인
  if (!fm['wiki_생성']) {
    warnings.push(`선택 필드 누락: wiki_생성`);
  }

  return [errors.length === 0, errors, warnings];
}

/**
 * 3. 스키마 구조 검증
 */
function validateStructure(content: string): [boolean, string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];

  const requiredSections = [
    { name: '결정', pattern: /## 🎯 결정/ },
    { name: '액션', pattern: /## ✅ 액션/ },
  ];

  for (const section of requiredSections) {
    if (!section.pattern.test(content)) {
      warnings.push(`권장 섹션 누락: ${section.name}`);
    }
  }

  // 액션 테이블 검증
  const tablePattern = /\| # \| 담당자 \| 항목 \| 마감 \| 상태 \| 의존성 \|/;
  if (!tablePattern.test(content)) {
    errors.push(`액션 테이블 스키마 오류: 올바른 컬럼이 없음`);
  }

  // 완료된 액션 섹션 검증
  if (!content.includes('## ✔️ 완료된 액션')) {
    errors.push(`필수 섹션 누락: 완료된 액션 (이전 회의)`);
  }

  // 미해결 액션 섹션 검증
  if (!content.includes('## ⏸️ 미해결 액션')) {
    errors.push(`필수 섹션 누락: 미해결 액션 (이전 회의)`);
  }

  return [errors.length === 0, errors, warnings];
}

/**
 * 4. Frontmatter와 파일명 일관성 검증
 */
function validateConsistency(
  fileName: string,
  frontmatter: string
): [boolean, string[]] {
  const errors: string[] = [];

  const fileDate = fileName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const fmDate = frontmatter.match(/회의일:\s*(\d{4}-\d{2}-\d{2})/)?.[1];

  if (fileDate && fmDate && fileDate !== fmDate) {
    errors.push(
      `파일명과 Frontmatter 회의일 불일치: ${fileDate} vs ${fmDate}`
    );
  }

  return [errors.length === 0, errors];
}

/**
 * 전체 검증 실행
 */
function validateWikiFile(filePath: string): ValidationResult {
  const fileName = path.basename(filePath);
  const result: ValidationResult = {
    fileName,
    passed: true,
    errors: [],
    warnings: [],
  };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // 1. 파일명 검증
    const [fileNameValid, fileNameErrors] = validateFileName(fileName);
    result.errors.push(...fileNameErrors);

    // 2. Frontmatter 검증
    const [fmValid, fmErrors, fmWarnings] = validateFrontmatter(content);
    result.errors.push(...fmErrors);
    result.warnings.push(...fmWarnings);

    // 3. 구조 검증
    const [structValid, structErrors, structWarnings] =
      validateStructure(content);
    result.errors.push(...structErrors);
    result.warnings.push(...structWarnings);

    // 4. 일관성 검증
    const frontmatterText = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || '';
    const [consistencyValid, consistencyErrors] = validateConsistency(
      fileName,
      frontmatterText
    );
    result.errors.push(...consistencyErrors);

    result.passed = result.errors.length === 0;
  } catch (error) {
    result.passed = false;
    result.errors.push(`파일 읽기 실패: ${error}`);
  }

  return result;
}

/**
 * 메인 실행
 */
function main() {
  console.log(`\n📋 Wiki 기계 검증 시작\n`);
  console.log(`대상: ${WIKI_DIR}\n`);
  console.log(`${'='.repeat(60)}\n`);

  if (!fs.existsSync(WIKI_DIR)) {
    log.error(`Wiki 디렉토리가 없습니다: ${WIKI_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(WIKI_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    log.warn(`검증할 Wiki 파일이 없습니다`);
    process.exit(0);
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of files) {
    const filePath = path.join(WIKI_DIR, file);
    const result = validateWikiFile(filePath);
    results.push(result);

    console.log(`\n📄 ${result.fileName}`);
    console.log(`${'─'.repeat(60)}`);

    if (result.passed) {
      log.success(`검증 통과`);
      totalPassed++;
    } else {
      log.error(`검증 실패`);
      totalFailed++;
    }

    if (result.errors.length > 0) {
      console.log(`\n❌ 오류 (${result.errors.length}개):`);
      for (const error of result.errors) {
        console.log(`  • ${error}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  경고 (${result.warnings.length}개):`);
      for (const warning of result.warnings) {
        console.log(`  • ${warning}`);
      }
    }
  }

  // 최종 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n📊 검증 결과 요약\n`);
  console.log(`총 파일: ${files.length}개`);
  log.success(`통과: ${totalPassed}개`);
  if (totalFailed > 0) {
    log.error(`실패: ${totalFailed}개`);
  }

  console.log(`\n${'='.repeat(60)}\n`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main();
