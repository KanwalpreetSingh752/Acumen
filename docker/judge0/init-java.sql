-- Judge0 CE Language Initialization / Adjustments for Local Windows / WSL2 Docker
-- Configures OpenJDK 13 with bounded memory flags to ensure reliable execution within isolated process memory limits

UPDATE languages 
SET compile_cmd = '/usr/local/openjdk13/bin/javac -J-Xms32m -J-Xmx128m -J-XX:MetaspaceSize=32m -J-XX:MaxMetaspaceSize=64m %s Main.java', 
    run_cmd = '/usr/local/openjdk13/bin/java -XX:+UseSerialGC -Xms32m -Xmx128m -XX:MetaspaceSize=32m -XX:MaxMetaspaceSize=64m Main' 
WHERE id = 62;
