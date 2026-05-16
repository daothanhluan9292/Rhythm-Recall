cmake_minimum_required(VERSION 3.10)
project(RhythmRecall)

set(CMAKE_CXX_STANDARD 17)

# Tìm thư viện SDL2
find_package(SDL2 REQUIRED)
find_package(SDL2_mixer REQUIRED)

include_directories(${SDL2_INCLUDE_DIRS} ${SDL2_MIXER_INCLUDE_DIRS})

add_executable(RhythmRecall main.cpp)

target_link_libraries(RhythmRecall ${SDL2_LIBRARIES} ${SDL2_MIXER_LIBRARIES})
