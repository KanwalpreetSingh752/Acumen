import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sbAnon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testN2() {
  const { data: authData } = await sbAnon.auth.signInWithPassword({
    email: process.env.TEST_USER_EMAIL,
    password: process.env.TEST_USER_PASSWORD
  });
  const token = authData.session.access_token;

  const n2JavaCode = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int target = sc.nextInt();
            int[] nums = new int[n];
            for (int i = 0; i < n; i++) nums[i] = sc.nextInt();

            // O(n^2) nested brute-force loops
            for (int i = 0; i < n; i++) {
                for (int j = i + 1; j < n; j++) {
                    if (nums[i] + nums[j] == target) {
                        System.out.println(i + " " + j);
                        return;
                    }
                }
            }
        }
    }
}`;

  console.log('Submitting O(n^2) Brute Force Java code...');
  const res = await fetch('http://localhost:3000/api/problems/prob-two-sum/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `prepflow_token=${token}`
    },
    body: JSON.stringify({
      language: 'java',
      sourceCode: n2JavaCode
    })
  });

  const data = await res.json();
  console.log('Verdict:', data.verdict);
  console.log('Passed:', `${data.testCasesPassed} / ${data.totalTestCases}`);
  console.log('Execution Time:', data.executionTime);
  console.log('Memory Used:', data.memoryUsed);
}

testN2().catch(console.error);
