import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testSubmit() {
  console.log('Authenticating test user...');
  const { data: authData, error: authErr } = await sbAnon.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD
  });

  if (authErr) {
    console.error('Auth error:', authErr.message);
    process.exit(1);
  }

  const token = authData.session.access_token;
  console.log('✓ Authenticated as:', authData.user.email);

  const baseUrl = 'http://localhost:3000';

  // 1. First test with Java solution
  const javaSolution = `import java.util.Scanner;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int target = sc.nextInt();
            int[] nums = new int[n];
            for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
            HashMap<Integer, Integer> map = new HashMap<>();
            for (int i = 0; i < n; i++) {
                int diff = target - nums[i];
                if (map.containsKey(diff)) {
                    System.out.println(map.get(diff) + " " + i);
                    return;
                }
                map.put(nums[i], i);
            }
        }
    }
}`;

  console.log('\n--- 1. Submitting Java Solution for Two Sum ---');
  const resJava = await fetch(`${baseUrl}/api/problems/prob-two-sum/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `prepflow_token=${token}`
    },
    body: JSON.stringify({
      language: 'java',
      sourceCode: javaSolution
    })
  });

  const dataJava = await resJava.json();
  console.log('HTTP Status:', resJava.status);
  console.log('Verdict:', dataJava.verdict);
  console.log('Passed:', `${dataJava.testCasesPassed} / ${dataJava.totalTestCases}`);
  console.log('Execution Time:', dataJava.executionTime);
  console.log('Memory Used:', dataJava.memoryUsed);

  // 2. Also test with Python solution
  const pythonSolution = `import sys

def main():
    data = sys.stdin.read().split()
    if not data: return
    n = int(data[0])
    target = int(data[1])
    nums = [int(x) for x in data[2:2+n]]
    mp = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in mp:
            print(f"{mp[diff]} {i}")
            return
        mp[num] = i

if __name__ == '__main__':
    main()`;

  console.log('\n--- 2. Submitting Python Solution for Two Sum ---');
  const resPy = await fetch(`${baseUrl}/api/problems/prob-two-sum/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `prepflow_token=${token}`
    },
    body: JSON.stringify({
      language: 'python',
      sourceCode: pythonSolution
    })
  });

  const dataPy = await resPy.json();
  console.log('HTTP Status:', resPy.status);
  console.log('Verdict:', dataPy.verdict);
  console.log('Passed:', `${dataPy.testCasesPassed} / ${dataPy.totalTestCases}`);
  console.log('Execution Time:', dataPy.executionTime);
  console.log('Memory Used:', dataPy.memoryUsed);

  // 3. Also test Run Code (Visible test cases)
  console.log('\n--- 3. Testing "Run Code" on Two Sum (Java) ---');
  const runRes = await fetch(`${baseUrl}/api/problems/prob-two-sum/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `prepflow_token=${token}`
    },
    body: JSON.stringify({
      language: 'java',
      sourceCode: javaSolution
    })
  });

  const runData = await runRes.json();
  console.log('Run Code allPassed:', runData.allPassed);
  console.log('Run Code passed/total:', `${runData.passed} / ${runData.total}`);
  if (runData.results) {
    runData.results.forEach((r) => {
      console.log(`  Case ${r.testCase}: [${r.status}] input="${r.input.replace(/\n/g, ' ')}" -> actual="${r.actualOutput.trim()}" expected="${r.expectedOutput.trim()}"`);
    });
  }
}

testSubmit().catch(console.error);
