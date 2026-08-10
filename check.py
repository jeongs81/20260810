#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Wiki 기계 검증 스크립트
1) Frontmatter 검증
2) 파일명 규칙 검증
3) 스키마 구조 검증
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Tuple

# UTF-8 인코딩 설정
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

WIKI_DIR = Path(__file__).parent / "wiki"
RAW_DIR = Path(__file__).parent / "raw"

# 색상 정의
class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'

def log_success(msg: str):
    print(f"{Color.GREEN}✅ {msg}{Color.RESET}")

def log_error(msg: str):
    print(f"{Color.RED}❌ {msg}{Color.RESET}")

def log_warn(msg: str):
    print(f"{Color.YELLOW}⚠️  {msg}{Color.RESET}")

def log_info(msg: str):
    print(f"{Color.BLUE}ℹ️  {msg}{Color.RESET}")

class ValidationResult:
    def __init__(self, filename: str):
        self.filename = filename
        self.errors: List[str] = []
        self.warnings: List[str] = []

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0

    def report(self):
        print(f"\n📄 {self.filename}")
        print(f"{'─' * 60}")

        if self.passed:
            log_success("검증 통과")
        else:
            log_error("검증 실패")

        if self.errors:
            print(f"\n❌ 오류 ({len(self.errors)}개):")
            for error in self.errors:
                print(f"  • {error}")

        if self.warnings:
            print(f"\n⚠️  경고 ({len(self.warnings)}개):")
            for warning in self.warnings:
                print(f"  • {warning}")

def validate_filename(filename: str) -> Tuple[bool, List[str]]:
    """파일명 규칙 검증 (YYYY-MM-DD-*.md)"""
    errors = []
    pattern = r'^\d{4}-\d{2}-\d{2}-.+\.md$'

    if not re.match(pattern, filename):
        errors.append("파일명 규칙 위반: YYYY-MM-DD-*.md 형식이어야 함")

    return len(errors) == 0, errors

def validate_frontmatter(content: str) -> Tuple[bool, List[str], List[str]]:
    """Frontmatter 검증"""
    errors = []
    warnings = []

    # Frontmatter 추출
    match = re.match(r'^---\n([\s\S]*?)\n---', content)
    if not match:
        errors.append("Frontmatter이 없습니다")
        return False, errors, warnings

    frontmatter_text = match.group(1)
    fm = {}

    for line in frontmatter_text.split('\n'):
        m = re.match(r'^([^:]+):\s*(.+)$', line)
        if m:
            fm[m.group(1).strip()] = m.group(2).strip()

    # 필수 필드 검증
    required_fields = ['원본', '회의일', '회의체', '참석']
    for field in required_fields:
        if field not in fm:
            errors.append(f"필수 필드 누락: {field}")

    # 회의일 형식 검증
    if '회의일' in fm:
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', fm['회의일']):
            errors.append("회의일 형식 오류: YYYY-MM-DD 형식이어야 함")

    # 선택 필드 확인
    if 'wiki_생성' not in fm:
        warnings.append("선택 필드 누락: wiki_생성")

    return len(errors) == 0, errors, warnings

def validate_structure(content: str) -> Tuple[bool, List[str], List[str]]:
    """스키마 구조 검증"""
    errors = []
    warnings = []

    required_sections = [
        ('결정', r'## 🎯 결정'),
        ('액션', r'## ✅ 액션'),
    ]

    for section_name, pattern in required_sections:
        if not re.search(pattern, content):
            warnings.append(f"권장 섹션 누락: {section_name}")

    # 액션 테이블 검증
    if not re.search(r'\| # \| 담당자 \| 항목 \| 마감 \| 상태 \| 의존성 \|', content):
        errors.append("액션 테이블 스키마 오류: 올바른 컬럼이 없음")

    # 완료된 액션 섹션 (권장)
    if '## ✔️ 완료된 액션' not in content:
        warnings.append("권장 섹션 누락: 완료된 액션 (이전 회의)")

    # 미해결 액션 섹션 (권장)
    if '## ⏸️ 미해결 액션' not in content:
        warnings.append("권장 섹션 누락: 미해결 액션 (이전 회의)")

    return len(errors) == 0, errors, warnings

def validate_consistency(filename: str, frontmatter_text: str) -> Tuple[bool, List[str]]:
    """Frontmatter와 파일명 일관성 검증"""
    errors = []

    file_date_match = re.match(r'^(\d{4}-\d{2}-\d{2})', filename)
    fm_date_match = re.search(r'회의일:\s*(\d{4}-\d{2}-\d{2})', frontmatter_text)

    if file_date_match and fm_date_match:
        file_date = file_date_match.group(1)
        fm_date = fm_date_match.group(1)

        if file_date != fm_date:
            errors.append(f"파일명과 Frontmatter 회의일 불일치: {file_date} vs {fm_date}")

    return len(errors) == 0, errors

def validate_wiki_file(filepath: Path) -> ValidationResult:
    """전체 Wiki 파일 검증"""
    filename = filepath.name
    result = ValidationResult(filename)

    try:
        content = filepath.read_text(encoding='utf-8')

        # 1. 파일명 검증
        file_valid, file_errors = validate_filename(filename)
        result.errors.extend(file_errors)

        # 2. Frontmatter 검증
        fm_valid, fm_errors, fm_warnings = validate_frontmatter(content)
        result.errors.extend(fm_errors)
        result.warnings.extend(fm_warnings)

        # 3. 구조 검증
        struct_valid, struct_errors, struct_warnings = validate_structure(content)
        result.errors.extend(struct_errors)
        result.warnings.extend(struct_warnings)

        # 4. 일관성 검증
        frontmatter_match = re.match(r'^---\n([\s\S]*?)\n---', content)
        if frontmatter_match:
            frontmatter_text = frontmatter_match.group(1)
            consistency_valid, consistency_errors = validate_consistency(filename, frontmatter_text)
            result.errors.extend(consistency_errors)

    except Exception as e:
        result.errors.append(f"파일 읽기 실패: {str(e)}")

    return result

def main():
    print("\n📋 Wiki 기계 검증 시작\n")
    print(f"대상: {WIKI_DIR}\n")
    print(f"{'=' * 60}\n")

    if not WIKI_DIR.exists():
        log_error(f"Wiki 디렉토리가 없습니다: {WIKI_DIR}")
        sys.exit(1)

    # Wiki 파일 목록
    wiki_files = sorted([f for f in WIKI_DIR.glob('*.md')])

    if not wiki_files:
        log_warn("검증할 Wiki 파일이 없습니다")
        sys.exit(0)

    results = []
    total_passed = 0
    total_failed = 0

    # 각 파일 검증
    for filepath in wiki_files:
        result = validate_wiki_file(filepath)
        results.append(result)
        result.report()

        if result.passed:
            total_passed += 1
        else:
            total_failed += 1

    # 최종 요약
    print(f"\n{'=' * 60}")
    print(f"\n📊 검증 결과 요약\n")
    print(f"총 파일: {len(wiki_files)}개")
    log_success(f"통과: {total_passed}개")
    if total_failed > 0:
        log_error(f"실패: {total_failed}개")

    print(f"\n{'=' * 60}\n")

    sys.exit(0 if total_failed == 0 else 1)

if __name__ == "__main__":
    main()
