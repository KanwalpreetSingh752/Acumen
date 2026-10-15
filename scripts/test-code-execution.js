/**
 * Automated Verification Script for Judge0 CE & /api/code/run
 * 
 * Tests:
 * 1. C++ 2-number addition with stdin (5 7 -> 12)
 * 2. Python 2-number addition with stdin (10 25 -> 35)
 * 3. Java 2-number addition with stdin (3 4 -> 7)
 * 4. JavaScript 2-number addition with stdin (20 22 -> 42)
 * 5. C++ Compilation Error detection
 * 6. Python Runtime Error (ZeroDivisionError) detection
 * 7. Python Time Limit Exceeded (infinite loop) detection
 */

import { executeCodeSubmission, SUPPORTED_LANGUAGES } from '../services/judge0.js';

const JUDGE0_URL = process.env.JUDGE0_URL || 'http://localhost:2358';

async function runTestSuite() {
  console.log(`\n======================================================`);
  console.log(` Starting Judge0 CE Automated Verification Test Suite`);
  console.log(` Target Judge0 URL: ${JUDGE0_URL}`);
  console.log(`======================================================\n`);

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    process.stdout.write(`[Test ${total}] ${name} ... `);
    try {
      await fn();
      console.log(`✓ PASSED`);
      passed++;
    } catch (err) {
      console.log(`✗ FAILED`);
      console.error(`   Error: ${err.message}`);
    }
  }

  // 1. C++ Valid Run
  await test('C++ (GCC) Execution with stdin "5 7" expecting "12"', async () => {
    const code = `#include <iostream>
using namespace std;
int main() {
    int a, b;
    if (cin >> a >> b) {
        cout << a + b;
    }
    return 0;
}`;
    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.cpp.id,
      stdin: '5 7',
      judge0Url: JUDGE0_URL
    });

    if (result.status !== 'Accepted') throw new Error(`Expected Accepted, got ${result.status} (${result.stderr || result.compileOutput})`);
    if ((result.stdout || '').trim() !== '12') throw new Error(`Expected output 12, got "${result.stdout}"`);
  });

  // 2. Python Valid Run
  await test('Python Execution with stdin "10 25" expecting "35"', async () => {
    const code = `import sys
parts = sys.stdin.read().split()
print(int(parts[0]) + int(parts[1]))`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.python.id,
      stdin: '10 25',
      judge0Url: JUDGE0_URL
    });

    if (result.status !== 'Accepted') throw new Error(`Expected Accepted, got ${result.status}`);
    if ((result.stdout || '').trim() !== '35') throw new Error(`Expected output 35, got "${result.stdout}"`);
  });

  // 3. Java Valid Run
  await test('Java Execution with stdin "3 4" expecting "7"', async () => {
    const code = `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        System.out.println(sc.nextInt() + sc.nextInt());
    }
}`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.java.id,
      stdin: '3 4',
      judge0Url: JUDGE0_URL
    });

    if (result.status !== 'Accepted') throw new Error(`Expected Accepted, got ${result.status} (compile: ${result.compileOutput}, stderr: ${result.stderr})`);
    if ((result.stdout || '').trim() !== '7') throw new Error(`Expected output 7, got "${result.stdout}"`);
  });

  // 4. JavaScript Valid Run
  await test('JavaScript (Node.js) Execution with stdin "20 22" expecting "42"', async () => {
    const code = `const fs = require('fs');
const [a, b] = fs.readFileSync(0, 'utf8').trim().split(/\\s+/).map(Number);
console.log(a + b);`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.javascript.id,
      stdin: '20 22',
      judge0Url: JUDGE0_URL
    });

    if (result.status !== 'Accepted') throw new Error(`Expected Accepted, got ${result.status} (compile: ${result.compileOutput}, stderr: ${result.stderr})`);
    if ((result.stdout || '').trim() !== '42') throw new Error(`Expected output 42, got "${result.stdout}"`);
  });

  // 5. C++ Compilation Error
  await test('C++ Compilation Error Detection', async () => {
    const code = `#include <iostream>
int main() {
    this_is_an_invalid_syntax_error;;
    return 0;
}`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.cpp.id,
      stdin: '',
      judge0Url: JUDGE0_URL
    });

    if (!result.status.includes('Compilation Error')) {
      throw new Error(`Expected Compilation Error status, got "${result.status}"`);
    }
    if (!result.compileOutput) {
      throw new Error('Expected non-empty compileOutput');
    }
  });

  // 6. Python Runtime Error
  await test('Python Runtime Error (ZeroDivisionError) Detection', async () => {
    const code = `x = 1 / 0`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.python.id,
      stdin: '',
      judge0Url: JUDGE0_URL
    });

    if (!result.status.includes('Runtime Error')) {
      throw new Error(`Expected Runtime Error status, got "${result.status}"`);
    }
    if (!result.stderr) {
      throw new Error('Expected non-empty stderr');
    }
  });

  // 7. Python Time Limit Exceeded
  await test('Python Time Limit Exceeded Detection', async () => {
    const code = `while True:\n    pass`;

    const result = await executeCodeSubmission({
      sourceCode: code,
      languageId: SUPPORTED_LANGUAGES.python.id,
      stdin: '',
      judge0Url: JUDGE0_URL
    });

    if (!result.status.includes('Time Limit Exceeded')) {
      throw new Error(`Expected Time Limit Exceeded status, got "${result.status}"`);
    }
  });

  console.log(`\n------------------------------------------------------`);
  console.log(` Test Summary: ${passed} / ${total} tests passed.`);
  console.log(`------------------------------------------------------\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
