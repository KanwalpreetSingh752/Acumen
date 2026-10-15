-- Phase 2: Student Coding Platform Submissions Table and RLS Policies
-- Run this migration in the Supabase SQL editor (Dashboard -> SQL Editor)

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  language text not null check (language in ('cpp', 'java', 'python', 'javascript')),
  code text not null,
  verdict text not null check (verdict in (
    'Accepted',
    'Wrong Answer',
    'Compilation Error',
    'Runtime Error',
    'Time Limit Exceeded',
    'Memory Limit Exceeded',
    'Internal Error'
  )),
  execution_time text,
  memory_used numeric,
  created_at timestamptz not null default now()
);

-- Indexes for querying by user, problem, and listing recent submissions
create index if not exists idx_submissions_user_problem on public.submissions(user_id, problem_id);
create index if not exists idx_submissions_problem_created on public.submissions(problem_id, created_at desc);
create index if not exists idx_submissions_user_created on public.submissions(user_id, created_at desc);

-- Enable Row Level Security
alter table public.submissions enable row level security;

-- Policies for authenticated users
drop policy if exists "Users can view their own submissions" on public.submissions;
drop policy if exists "Users can insert their own submissions" on public.submissions;

create policy "Users can view their own submissions"
  on public.submissions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own submissions"
  on public.submissions
  for insert
  to authenticated
  with check (auth.uid() = user_id);
