/**
 * Centralized Judge0 Configuration and Language Mapping
 * 
 * Language IDs for Judge0 CE v1.13.1:
 * - C++ (GCC 9.2.0): 54
 * - Java (OpenJDK 13.0.1): 62
 * - Python (3.8.1): 71
 * - JavaScript (Node.js 12.14.0): 63
 */

export const SUPPORTED_LANGUAGES = {
  cpp: {
    id: 54,
    key: 'cpp',
    name: 'C++ (GCC 9.2.0)',
    monaco: 'cpp',
    defaultCode: `#include <iostream>
using namespace std;

int main() {
    int a = 0, b = 0;
    if (cin >> a >> b) {
        cout << "Sum: " << (a + b) << endl;
    } else {
        cout << "Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)" << endl;
    }
    return 0;
}`
  },
  java: {
    id: 62,
    key: 'java',
    name: 'Java (OpenJDK 13.0.1)',
    monaco: 'java',
    defaultCode: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int a = sc.nextInt();
            if (sc.hasNextInt()) {
                int b = sc.nextInt();
                System.out.println("Sum: " + (a + b));
                return;
            }
        }
        System.out.println("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)");
    }
}`
  },
  python: {
    id: 71,
    key: 'python',
    name: 'Python (3.8.1)',
    monaco: 'python',
    defaultCode: `import sys

data = sys.stdin.read().split()
if len(data) >= 2:
    print("Sum:", int(data[0]) + int(data[1]))
else:
    print("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)")
`
  },
  javascript: {
    id: 63,
    key: 'javascript',
    name: 'JavaScript (Node.js 12.14.0)',
    monaco: 'javascript',
    defaultCode: `const fs = require('fs');

const input = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/).filter(Boolean);
if (input.length >= 2) {
  console.log("Sum:", Number(input[0]) + Number(input[1]));
} else {
  console.log("Hello from PrepFlow! (Enter numbers in stdin box above to compute sum)");
}
`
  }
};

const MAX_SOURCE_BYTES = 64 * 1024; // 64 KB
const MAX_STDIN_BYTES = 32 * 1024;  // 32 KB
const POLL_INTERVAL_MS = 350;
const MAX_POLL_TIMEOUT_MS = 15000;

export function getSupportedLanguageByIdOrKey(identifier) {
  if (!identifier) return null;
  const numId = Number(identifier);
  if (!Number.isNaN(numId)) {
    return Object.values(SUPPORTED_LANGUAGES).find((lang) => lang.id === numId) || null;
  }
  const key = String(identifier).trim().toLowerCase();
  return SUPPORTED_LANGUAGES[key] || null;
}

/**
 * Validates request payload
 */
export function validateCodeSubmission({ sourceCode, languageId, stdin }) {
  if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
    const error = new Error('sourceCode is required.');
    error.statusCode = 400;
    throw error;
  }
  if (Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_BYTES) {
    const error = new Error('sourceCode exceeds maximum allowed size (64 KB).');
    error.statusCode = 400;
    throw error;
  }

  const lang = getSupportedLanguageByIdOrKey(languageId);
  if (!lang) {
    const validNames = Object.values(SUPPORTED_LANGUAGES).map((l) => `${l.name} (id: ${l.id})`).join(', ');
    const error = new Error(`Unsupported language '${languageId}'. Supported: ${validNames}`);
    error.statusCode = 400;
    throw error;
  }

  if (stdin !== undefined && stdin !== null && typeof stdin !== 'string') {
    const error = new Error('stdin must be a string.');
    error.statusCode = 400;
    throw error;
  }

  if (stdin && Buffer.byteLength(stdin, 'utf8') > MAX_STDIN_BYTES) {
    const error = new Error('stdin exceeds maximum allowed size (32 KB).');
    error.statusCode = 400;
    throw error;
  }

  return {
    sourceCode,
    language: lang,
    stdin: stdin || ''
  };
}

/**
 * Execute submission on Judge0 CE
 */
export async function executeCodeSubmission({ sourceCode, languageId, stdin, judge0Url }) {
  const { language, stdin: cleanStdin } = validateCodeSubmission({ sourceCode, languageId, stdin });
  const baseUrl = (judge0Url || process.env.JUDGE0_URL || 'http://localhost:2358').replace(/\/+$/, '');

  // 1. Submit code to Judge0 (with base64 encoding for safe transport)
  const encodedSource = Buffer.from(sourceCode, 'utf8').toString('base64');
  const encodedStdin = cleanStdin ? Buffer.from(cleanStdin, 'utf8').toString('base64') : '';

  let submitResponse;
  try {
    submitResponse = await fetch(`${baseUrl}/submissions?base64_encoded=true&wait=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source_code: encodedSource,
        language_id: language.id,
        stdin: encodedStdin,
        cpu_time_limit: 5,
        memory_limit: 1048576,
        max_processes_and_or_threads: 256
      })
    });
  } catch (err) {
    const error = new Error(`Cannot connect to Judge0 execution service at ${baseUrl}. Ensure Docker Desktop and Judge0 containers are running.`);
    error.statusCode = 503;
    throw error;
  }

  if (!submitResponse.ok) {
    const text = await submitResponse.text();
    const error = new Error(`Judge0 API error (${submitResponse.status}): ${text || submitResponse.statusText}`);
    error.statusCode = 502;
    throw error;
  }

  const { token } = await submitResponse.json();
  if (!token) {
    const error = new Error('Failed to obtain submission token from Judge0.');
    error.statusCode = 502;
    throw error;
  }

  // 2. Poll until submission finishes or timeout is reached
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollResponse = await fetch(`${baseUrl}/submissions/${token}?base64_encoded=true`, {
      headers: { Accept: 'application/json' }
    });

    if (!pollResponse.ok) {
      const text = await pollResponse.text();
      const error = new Error(`Judge0 polling error (${pollResponse.status}): ${text || pollResponse.statusText}`);
      error.statusCode = 502;
      throw error;
    }

    const data = await pollResponse.json();
    const statusId = data.status?.id;

    // Status IDs: 1 = In Queue, 2 = Processing
    if (statusId !== 1 && statusId !== 2) {
      return normalizeJudge0Result(data);
    }
  }

  return {
    status: 'Time Limit Exceeded',
    stdout: null,
    stderr: 'Backend polling timed out while waiting for Judge0 to complete execution.',
    compileOutput: null,
    time: null,
    memory: null
  };
}

function decodeBase64(val) {
  if (val === null || val === undefined) return null;
  try {
    return Buffer.from(val, 'base64').toString('utf8');
  } catch {
    return String(val);
  }
}

/**
 * Normalizes Judge0 output format
 */
export function normalizeJudge0Result(raw) {
  const statusDescription = raw.status?.description || 'Unknown';

  return {
    status: statusDescription,
    stdout: decodeBase64(raw.stdout),
    stderr: decodeBase64(raw.stderr),
    compileOutput: decodeBase64(raw.compile_output),
    time: raw.time !== undefined && raw.time !== null ? String(raw.time) : null,
    memory: raw.memory !== undefined && raw.memory !== null ? Number(raw.memory) : null
  };
}

/**
 * Normalizes string output by trimming leading/trailing whitespace,
 * normalizing linebreaks, and collapsing interior whitespace on each line.
 * For example: "0 1" and "0   1" are treated as equal.
 */
export function normalizeOutput(str) {
  if (typeof str !== 'string') return '';
  return str
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim().split(/\s+/).filter(Boolean).join(' '))
    .filter(line => line.length > 0)
    .join('\n');
}

