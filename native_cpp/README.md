# Hướng dẫn đóng gói ứng dụng C++ cho Desktop

Để biên dịch và chạy file C++ này trên máy tính của bạn, hãy làm theo các bước sau:

## 1. Cài đặt môi trường
- **Windows**: Cài đặt [Visual Studio](https://visualstudio.microsoft.com/) cộng với "C++ Desktop Development". Tải thư viện SDL2 và SDL2_mixer bản phát triển.
- **MacOS**: Chạy lệnh `brew install sdl2 sdl2_mixer cmake`.
- **Linux**: Chạy `sudo apt-get install libsdl2-dev libsdl2-mixer-dev cmake`.

## 2. Biên dịch (Build)
Sử dụng terminal tại thư mục `native_cpp`:
```bash
mkdir build
cd build
cmake ..
cmake --build .
```

## 3. Chạy ứng dụng
Sau khi biên dịch thành công, bạn sẽ thấy file thực thi `RhythmRecall` (hoặc `RhythmRecall.exe`) trong thư mục build. Chạy nó để chơi game phiên bản Native C++.
