#!/bin/bash
VAR="hello"
cat << INNEREQF
TEST='$VAR'
INNEREQF
