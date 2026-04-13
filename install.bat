set mypath= "%cd%
cd %mypath%
cd Dispatch 2.3
call create_db.bat
SET F="deamon"
IF EXIST %F% RMDIR  %F%
node install.js
node register.js
echo Install successfull. 
@echo off
pause