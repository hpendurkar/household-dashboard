@echo off
title GitHub Setup - Household Dashboard
echo.
echo  ============================================
echo   GitHub Repository Setup
echo  ============================================
echo.
echo  Step 1: Log in to GitHub (browser will open)
echo.
gh auth login --web -h github.com
if %errorlevel% neq 0 (
    echo.
    echo  Auth failed. Please try again.
    pause
    exit /b 1
)
echo.
echo  Step 2: Creating repository and pushing...
echo.
gh repo create household-dashboard --public --source=. --remote=origin --push
if %errorlevel% neq 0 (
    echo.
    echo  Repo creation failed. It may already exist.
    echo  Trying to push to existing remote...
    git push -u origin master
)
echo.
echo  ============================================
echo   Done! Your repo is live on GitHub.
echo   Visit: https://github.com/hpendurkar/household-dashboard
echo  ============================================
echo.
pause
